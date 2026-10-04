import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { IS_PUBLIC, ROLES } from './decorators.js';
import { TokenVerifier } from './token-verifier.service.js';

/** Global guard: every route needs a valid token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.headers.authorization;
    const user = await this.verifier.verify(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    req.user = user;

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) {
      // Spec, story "Role-scoped navigation": out-of-role calls get 403 and the attempt is logged.
      await this.audit.appendStandalone({
        entity: 'access',
        action: 'access.denied',
        actorId: user.id,
        data: { method: req.method, path: req.path, role: user.role },
      });
      throw new ForbiddenException(`This action is limited to: ${roles.join(', ')}.`);
    }
    return true;
  }
}
