import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { loadSessionAccess } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NOTIFY, shouldNotify } from './notifications.js';

class NotificationDto {
  @ApiProperty() seq: string;
  @ApiProperty() at: string;
  @ApiProperty() action: string;
  @ApiProperty({ nullable: true, type: String }) actorName: string | null;
}

@Controller('sessions/:id/notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** The 30 most recent events relevant to my role in this session, newest first. */
  @Get()
  @ApiOkResponse({ type: [NotificationDto] })
  async list(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<NotificationDto[]> {
    const { me } = await loadSessionAccess(this.prisma, id, user);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        sessionId: id,
        action: { in: Object.keys(NOTIFY) },
        OR: [{ visibilitySide: null }, { visibilitySide: user.side }],
      },
      orderBy: { seq: 'desc' },
      take: 200,
      include: { actor: { select: { name: true } } },
    });
    return events
      .filter((e) => shouldNotify(e.action, me.sessionRole, e.entityId === me.id))
      .slice(0, 30)
      .map((e) => ({ seq: e.seq.toString(), at: e.at.toISOString(), action: e.action, actorName: e.actor?.name ?? null }));
  }
}
