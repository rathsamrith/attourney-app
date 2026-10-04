import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Side, UserRole } from '../generated/prisma/client.js';

/** The signed-in user as resolved from the token and the users table. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  side: Side;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
