import { Injectable, NotFoundException } from '@nestjs/common';
import type { Side, User, UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/current-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  side: Side;
  active: boolean;
  createdAt: string;
}

interface CreateInput {
  name: string;
  email: string;
  role: UserRole;
  side: Side;
}
interface UpdateInput {
  name?: string;
  role?: UserRole;
  side?: Side;
  active?: boolean;
}

const toDto = (u: User): AdminUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  side: u.side,
  active: !u.deactivatedAt,
  createdAt: u.createdAt.toISOString(),
});

/** User and role administration (record officer only; see permissions.ts 'admin'). */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminUser[]> {
    const users = await this.prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    return users.map(toDto);
  }

  async create(input: CreateInput, actor: AuthUser): Promise<AdminUser> {
    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        role: input.role,
        side: input.side,
        authMethod: 'password_mfa',
        mfaEnrolled: true,
      },
    });
    await this.audit.appendStandalone({
      entity: 'user',
      entityId: user.id,
      action: 'user.created',
      actorId: actor.id,
      data: { email: user.email, role: user.role, side: user.side },
    });
    return toDto(user);
  }

  async update(id: string, input: UpdateInput, actor: AuthUser): Promise<AdminUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');

    const data: { name?: string; role?: UserRole; side?: Side; deactivatedAt?: Date | null } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.role !== undefined) data.role = input.role;
    if (input.side !== undefined) data.side = input.side;
    if (input.active !== undefined) data.deactivatedAt = input.active ? null : new Date();

    const user = await this.prisma.user.update({ where: { id }, data });
    const action =
      input.active === false
        ? 'user.deactivated'
        : input.active === true
          ? 'user.reactivated'
          : 'user.updated';
    await this.audit.appendStandalone({
      entity: 'user',
      entityId: user.id,
      action,
      actorId: actor.id,
      data: { role: user.role, side: user.side, active: !user.deactivatedAt },
    });
    return toDto(user);
  }
}
