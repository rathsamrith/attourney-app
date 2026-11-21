import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { SignJWT } from 'jose';
import nodemailer, { type Transporter } from 'nodemailer';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { DEMO_ISSUER } from './token-verifier.service.js';

interface Pending {
  code: string;
  expiresAt: number;
  attempts: number;
}

export interface DemoUser {
  email: string;
  name: string;
  role: string;
  side: string;
}

/**
 * One-time-code sign-in: a 6-digit code is emailed over SMTP (MailHog in dev, or any
 * real provider via SMTP_* env) instead of a password, and a short-lived app JWT is
 * issued on success. Active when AUTH_MODE=otp; AUTH_MODE=oidc uses Keycloak instead.
 */
@Injectable()
export class OtpService implements OnModuleInit {
  private readonly log = new Logger('OtpService');
  private readonly pending = new Map<string, Pending>();
  private readonly ttlMs = 5 * 60_000;
  private readonly maxAttempts = 5;
  private readonly adminEmail?: string;
  private readonly adminPassword?: string;

  /** True when sign-in uses an emailed one-time code (the default) rather than OIDC. */
  readonly otpEnabled: boolean;
  /** True when the sign-in screen may list the seeded test accounts. */
  readonly showCredentials: boolean;
  private readonly secret: Uint8Array;
  private readonly audience: string;
  private readonly mailer: Transporter;
  private readonly mailFrom: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.otpEnabled = String(config.get('AUTH_MODE') ?? 'otp').toLowerCase() !== 'oidc';
    const showEnv = config.get('SHOW_TEST_CREDENTIALS');
    this.showCredentials = showEnv === undefined ? this.otpEnabled : String(showEnv) === 'true';
    this.secret = new TextEncoder().encode(config.get<string>('OTP_JWT_SECRET') ?? 'attest-demo-otp-secret-change-me');
    this.audience = config.getOrThrow<string>('OIDC_AUDIENCE');
    this.mailFrom = config.get<string>('MAIL_FROM') ?? 'Attest <no-reply@attest.local>';

    // SMTP transport. With no SMTP_USER it talks plainly to MailHog in dev; set
    // SMTP_HOST/PORT/SECURE/USER/PASS for a real provider (587 STARTTLS or 465 TLS).
    const user = config.get<string>('SMTP_USER') || undefined;
    this.mailer = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(config.get('SMTP_PORT') ?? 1025),
      secure: String(config.get('SMTP_SECURE') ?? 'false') === 'true',
      auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
    });

    this.adminEmail = config.get<string>('ADMIN_EMAIL') || undefined;
    this.adminPassword = config.get<string>('ADMIN_PASSWORD') || undefined;
  }

  /** Bootstrap a password-based admin account from env, so there is always one admin. */
  async onModuleInit(): Promise<void> {
    if (!this.adminEmail || !this.adminPassword) return;
    const email = this.adminEmail.toLowerCase();
    const passwordHash = hashPassword(this.adminPassword);
    try {
      await this.prisma.user.upsert({
        where: { email },
        update: { role: 'admin', passwordHash, deactivatedAt: null },
        create: {
          email,
          name: 'Administrator',
          role: 'admin',
          side: 'T',
          authMethod: 'password_mfa',
          mfaEnrolled: true,
          passwordHash,
        },
      });
      this.log.log(`Admin account ready: ${email}`);
    } catch (e) {
      this.log.error(`Could not bootstrap admin account: ${(e as Error).message}`);
    }
  }

  /** Sign a short-lived app JWT the guard accepts (shared by OTP and admin sign-in). */
  private issueToken(user: User): Promise<string> {
    return new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(DEMO_ISSUER)
      .setAudience(this.audience)
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(this.secret);
  }

  /** Password sign-in for admins only (bypasses OTP). */
  async adminLogin(email: string, password: string): Promise<{ token: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.deactivatedAt || user.role !== 'admin' || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    return { token: await this.issueToken(user) };
  }

  /** The seeded accounts, shown as "role → credentials" on the sign-in screen (test helper). */
  async demoUsers(): Promise<DemoUser[]> {
    if (!this.showCredentials) return [];
    const users = await this.prisma.user.findMany({ where: { deactivatedAt: null }, orderBy: { role: 'asc' } });
    return users.map((u) => ({ email: u.email, name: u.name, role: u.role, side: u.side }));
  }

  /** Generate and email a one-time code. Silent when the email is unknown (no account enumeration). */
  async requestOtp(email: string): Promise<void> {
    if (!this.otpEnabled) throw new UnauthorizedException('One-time-code sign-in is disabled.');
    const key = email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: key } });
    if (!user || user.deactivatedAt) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.pending.set(key, { code, expiresAt: Date.now() + this.ttlMs, attempts: 0 });
    try {
      await this.sendMail(user.email, user.name, code);
    } catch (e) {
      this.log.error(`Could not send OTP email: ${(e as Error).message}`);
    }
  }

  /** Check a code and, on success, issue a short-lived app JWT. */
  async verifyOtp(email: string, code: string): Promise<{ token: string }> {
    if (!this.otpEnabled) throw new UnauthorizedException('One-time-code sign-in is disabled.');
    const key = email.toLowerCase();
    const p = this.pending.get(key);
    if (!p || p.expiresAt < Date.now()) {
      this.pending.delete(key);
      throw new UnauthorizedException('The code has expired. Request a new one.');
    }
    if (p.attempts >= this.maxAttempts) {
      this.pending.delete(key);
      throw new UnauthorizedException('Too many attempts. Request a new code.');
    }
    p.attempts += 1;
    if (code !== p.code) throw new UnauthorizedException('That code is not correct.');
    this.pending.delete(key);

    const user = await this.prisma.user.findUnique({ where: { email: key } });
    if (!user || user.deactivatedAt) throw new UnauthorizedException('This account has no access to Attest.');

    return { token: await this.issueToken(user) };
  }

  private async sendMail(to: string, name: string, code: string): Promise<void> {
    await this.mailer.sendMail({
      from: this.mailFrom,
      to,
      subject: `Your Attest sign-in code: ${code}`,
      text:
        `Hello ${name},\n\n` +
        `Your one-time sign-in code is ${code}.\n` +
        `It expires in 5 minutes.\n\n` +
        `If you did not request this, you can ignore this email.\n\n` +
        `Attest - Remote hearing platform\n`,
      html: this.htmlEmail(name, code),
    });
  }

  /** Branded, email-client-safe HTML (table layout, inline styles). */
  private htmlEmail(name: string, code: string): string {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your Attest sign-in code</title></head>
<body style="margin:0; padding:0; background:#f3f4f6;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">Your Attest one-time sign-in code is ${code}. It expires in 5 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6; padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:#111a2e; padding:24px 32px;">
<div style="color:#d9a94a; font-size:13px; font-weight:700; letter-spacing:3px; text-transform:uppercase;">Attest</div>
<div style="color:#aab6c6; font-size:12px; margin-top:4px;">Remote hearing platform</div>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 8px; font-size:20px; color:#111a2e;">Your sign-in code</h1>
<p style="margin:0 0 24px; font-size:15px; line-height:1.5; color:#4a5568;">Hello ${esc(name)}, use this one-time code to sign in to Attest.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#f7f6f2; border:1px solid #e6e3db; border-radius:12px; padding:20px;">
<div style="font-family:SFMono-Regular,Consolas,Menlo,monospace; font-size:36px; font-weight:700; letter-spacing:10px; color:#111a2e;">${code}</div>
</td></tr></table>
<p style="margin:20px 0 0; font-size:13px; line-height:1.5; color:#6a7179;">This code expires in <strong style="color:#111a2e;">5 minutes</strong>. If you did not request it, you can safely ignore this email.</p>
</td></tr>
<tr><td style="padding:16px 32px; background:#f7f6f2; border-top:1px solid #e6e3db;">
<p style="margin:0; font-size:12px; color:#8a8577;">Attest &middot; Automated message &mdash; please do not reply.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  }
}
