import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './current-user.js';

/**
 * Verifies OIDC access tokens against the identity provider's published keys,
 * then resolves the user in our own users table, which is the source of truth
 * for role and side. The IdP only proves who the person is.
 * Used by the HTTP guard and the Socket.IO gateway.
 */
@Injectable()
export class TokenVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.issuer = config.getOrThrow<string>('OIDC_ISSUER');
    this.audience = config.getOrThrow<string>('OIDC_AUDIENCE');
    // The keys normally live at the issuer, but in some deployments (e.g. Docker, where
    // the issuer is a browser-facing URL) the backend reaches the IdP at a different
    // internal address. OIDC_JWKS_URI overrides where the keys are fetched from; the
    // issuer claim is still validated against OIDC_ISSUER below.
    const jwksUri = config.get<string>('OIDC_JWKS_URI') ?? `${this.issuer}/protocol/openid-connect/certs`;
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  async verify(token: string | undefined): Promise<AuthUser> {
    if (!token) throw new UnauthorizedException('Sign in to continue.');

    let payload: JWTPayload & { email?: string };
    try {
      ({ payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer, audience: this.audience }));
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    const user = payload.email
      ? await this.prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } })
      : null;
    if (!user || user.deactivatedAt) {
      throw new UnauthorizedException('This account has no access to Attest.');
    }
    return { id: user.id, email: user.email, name: user.name, role: user.role, side: user.side };
  }
}
