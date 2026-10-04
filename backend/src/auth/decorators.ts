import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/client.js';

export const IS_PUBLIC = 'attest:public';
export const ROLES = 'attest:roles';

/** Skips authentication. Use only for health checks and similar. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to these user roles. Refusals return 403 and are audited. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);
