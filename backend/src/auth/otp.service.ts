import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { connect } from 'node:net';
import { SignJWT } from 'jose';
import { PrismaService } from '../prisma/prisma.service.js';
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
 * Demo-only sign-in: a one-time code is emailed (to MailHog in dev) instead of a
 * password, and a short-lived app JWT is issued on success. Enabled by DEMO_AUTH;
 * production uses the Keycloak OIDC path in TokenVerifier instead.
 */
@Injectable()
export class OtpService {
  private readonly log = new Logger('OtpService');
  private readonly pending = new Map<string, Pending>();
  private readonly ttlMs = 5 * 60_000;
  private readonly maxAttempts = 5;

  /** True when sign-in uses an emailed one-time code (the default) rather than OIDC. */
  readonly otpEnabled: boolean;
  /** True when the sign-in screen may list the seeded test accounts. */
  readonly showCredentials: boolean;
  private readonly secret: Uint8Array;
  private readonly audience: string;
  private readonly smtpHost: string;
  private readonly smtpPort: number;
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
    this.smtpHost = config.get<string>('SMTP_HOST') ?? 'localhost';
    this.smtpPort = Number(config.get('SMTP_PORT') ?? 1025);
    this.mailFrom = config.get<string>('MAIL_FROM') ?? 'Attest <no-reply@attest.local>';
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

    const token = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(DEMO_ISSUER)
      .setAudience(this.audience)
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(this.secret);
    return { token };
  }

  private sendMail(to: string, name: string, code: string): Promise<void> {
    const boundary = `attest_${Math.random().toString(36).slice(2)}`;
    const text =
      `Hello ${name},\r\n\r\n` +
      `Your one-time sign-in code is ${code}.\r\n` +
      `It expires in 5 minutes.\r\n\r\n` +
      `If you did not request this, you can ignore this email.\r\n\r\n` +
      `Attest - Remote hearing platform\r\n`;
    const message = [
      `From: ${this.mailFrom}`,
      `To: ${to}`,
      `Subject: Your Attest sign-in code: ${code}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      this.htmlEmail(name, code),
      `--${boundary}--`,
      '',
    ].join('\r\n');
    return this.smtp(to, message);
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

  /** Minimal SMTP (no auth, no TLS) — enough for MailHog. */
  private smtp(to: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const steps = [
        'EHLO attest',
        'MAIL FROM:<no-reply@attest.local>',
        `RCPT TO:<${to}>`,
        'DATA',
        // Dot-stuffing: a line that is just "." would otherwise end the message early.
        `${message.replace(/\r\n\./g, '\r\n..')}\r\n.`,
        'QUIT',
      ];
      let i = 0;
      const sock = connect(this.smtpPort, this.smtpHost);
      sock.setEncoding('utf8');
      sock.setTimeout(5000, () => {
        sock.destroy();
        reject(new Error('SMTP timeout'));
      });
      sock.on('error', reject);
      sock.on('data', () => {
        if (i < steps.length) sock.write(steps[i++] + '\r\n');
        else {
          sock.end();
          resolve();
        }
      });
    });
  }
}
