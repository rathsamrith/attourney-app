import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Side } from '../generated/prisma/client.js';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CaucusRoomDto } from './proceeding.dto.js';

/**
 * Story "Isolated caucus" (R2, R8). Only same-side participants can join, caucus presence
 * stops sworn time, and only opening, closing and presence changes are audited, never content.
 */
@Injectable()
export class CaucusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
  ) {}

  private partySide(user: AuthUser): Side {
    if (user.side !== 'P' && user.side !== 'D') {
      throw new BlockedException('Caucus rooms are for the parties, not the tribunal.', { code: 'caucus.notAParty' });
    }
    return user.side;
  }

  /** Open rooms for my side only; the other side never learns room ids or members. */
  async list(sessionId: string, user: AuthUser): Promise<CaucusRoomDto[]> {
    await loadSessionAccess(this.prisma, sessionId, user);
    if (user.side !== 'P' && user.side !== 'D') return [];
    const rooms = await this.prisma.caucusRoom.findMany({
      where: { sessionId, side: user.side, closedAt: null },
      orderBy: { openedAt: 'asc' },
    });
    const members = await this.prisma.participant.findMany({
      where: { sessionId, presence: 'caucus' },
      include: { user: true, presenceEvents: { orderBy: { at: 'desc' }, take: 1 } },
    });
    return rooms.map((r) => {
      const inRoom = members.filter((m) => m.presenceEvents[0]?.caucusRoomId === r.id);
      return {
        id: r.id,
        side: r.side,
        openedAt: r.openedAt.toISOString(),
        members: inRoom.map((m) => ({ participantId: m.id, name: m.user.name })),
        iAmIn: inRoom.some((m) => m.userId === user.id),
      };
    });
  }

  open(sessionId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['counsel'], 'Opening a caucus room');
        const side = this.partySide(user);
        if (session.recordState === 'closed') {
          throw new BlockedException('This session is closed. Closing cannot be undone.', { code: 'recordState.closed' });
        }
        if (await tx.caucusRoom.count({ where: { sessionId, side, closedAt: null } })) {
          throw new BlockedException('Your side already has an open caucus room.', { code: 'caucus.alreadyOpen' });
        }
        return tx.caucusRoom.create({ data: { sessionId, side, openedById: user.id } });
      },
      (room) => ({
        entity: 'caucus_room',
        entityId: room.id,
        action: 'caucus.opened',
        sessionId,
        actorId: user.id,
        visibilitySide: room.side,
      }),
    );
  }

  private async loadRoom(tx: Prisma.TransactionClient, roomId: string, user: AuthUser) {
    const room = await tx.caucusRoom.findUnique({ where: { id: roomId } });
    // Other side's rooms look the same as missing ones.
    if (!room || room.side !== user.side) throw new NotFoundException('Caucus room not found.');
    const access = await loadSessionAccess(tx, room.sessionId, user);
    return { room, ...access };
  }

  join(roomId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { room, session, me } = await this.loadRoom(tx, roomId, user);
        if (room.closedAt) throw new BlockedException('This caucus room is closed.', { code: 'caucus.closed' });
        if (!me.sworn) {
          throw new BlockedException('You have not been admitted to the hearing room yet.', { code: 'presence.notAdmitted' });
        }
        if (me.presence === 'caucus') throw new BlockedException('You are already in a caucus room.', { code: 'caucus.alreadyIn' });
        await tx.presenceEvent.create({ data: { participantId: me.id, state: 'caucus', caucusRoomId: room.id } });
        await tx.participant.update({ where: { id: me.id }, data: { presence: 'caucus' } });
        return { session, me };
      },
      ({ session, me }) => ({
        entity: 'participant',
        entityId: me.id,
        action: 'presence.changed',
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
        data: { from: me.presence, to: 'caucus' },
      }),
    );
  }

  leave(roomId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await this.loadRoom(tx, roomId, user);
        if (me.presence !== 'caucus') throw new BlockedException('You are not in a caucus room.', { code: 'caucus.notIn' });
        await tx.presenceEvent.create({ data: { participantId: me.id, state: 'present' } });
        await tx.participant.update({ where: { id: me.id }, data: { presence: 'present' } });
        return { session, me };
      },
      ({ session, me }) => ({
        entity: 'participant',
        entityId: me.id,
        action: 'presence.changed',
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
        data: { from: 'caucus', to: 'present' },
      }),
    );
  }

  /** Closing returns everyone in the room to the hearing room. */
  close(roomId: string, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { room, session, me } = await this.loadRoom(tx, roomId, user);
        requireSessionRole(me, ['counsel'], 'Closing a caucus room');
        if (room.closedAt) throw new BlockedException('This caucus room is closed.', { code: 'caucus.closed' });
        const inCaucus = await tx.participant.findMany({
          where: { sessionId: room.sessionId, presence: 'caucus' },
          include: { presenceEvents: { orderBy: { at: 'desc' }, take: 1 } },
        });
        for (const p of inCaucus.filter((p) => p.presenceEvents[0]?.caucusRoomId === room.id)) {
          await tx.presenceEvent.create({ data: { participantId: p.id, state: 'present' } });
          await tx.participant.update({ where: { id: p.id }, data: { presence: 'present' } });
        }
        await tx.caucusRoom.update({ where: { id: room.id }, data: { closedAt: new Date() } });
        return { room, session };
      },
      ({ room, session }) => ({
        entity: 'caucus_room',
        entityId: room.id,
        action: 'caucus.closed',
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
        visibilitySide: room.side,
      }),
    );
  }
}
