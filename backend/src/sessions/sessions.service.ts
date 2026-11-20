import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Presence, Prisma, RecordState, SessionRole } from '../generated/prisma/client.js';
import type { AuditInput } from '../audit/audit.service.js';
import { CommandRunner } from '../audit/command-runner.js';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess, requireSessionRole } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ScheduledSessionDto,
  ScheduleResultDto,
  ScheduleSessionDto,
  SessionDetailDto,
  SessionSummaryDto,
} from './sessions.dto.js';
import { RECORD_ACTIONS, swornSeconds, type RecordPoint } from './sworn-time.js';

/** Allowed record-state moves. Closing is irreversible (data dictionary, sessions). */
const TRANSITIONS: Record<RecordState, RecordState[]> = {
  off: ['open', 'closed'],
  open: ['off', 'recess', 'closed'],
  recess: ['open', 'closed'],
  closed: [],
};

export const RECORD_ACTION_FOR: Record<RecordState, string> = {
  open: 'record.opened',
  off: 'record.went_off',
  recess: 'record.recessed',
  closed: 'session.closed',
};

/** Presence states the record officer sets from the appearance list. Caucus has its own flow. */
export type OfficerPresence = Extract<Presence, 'present' | 'sidebar' | 'absent'>;

@Injectable()
export class SessionsService {
  private readonly errataWindowDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRunner,
    config: ConfigService,
  ) {
    this.errataWindowDays = Number(config.get('ERRATA_WINDOW_DAYS') ?? 30);
  }

  async listMine(user: AuthUser): Promise<SessionSummaryDto[]> {
    const rows = await this.prisma.participant.findMany({
      where: { userId: user.id },
      include: { session: { include: { matter: true } } },
      orderBy: { session: { startsAt: 'asc' } },
    });
    return rows.map((p) => ({
      id: p.session.id,
      matterId: p.session.matterId,
      caption: p.session.matter.caption,
      docketNo: p.session.matter.docketNo,
      forum: p.session.matter.forum,
      dayNo: p.session.dayNo,
      startsAt: p.session.startsAt.toISOString(),
      recordState: p.session.recordState,
      mySessionRole: p.sessionRole,
    }));
  }

  /** Record-state history for sworn time, taken from the audit trail. */
  async recordHistory(db: Prisma.TransactionClient | PrismaService, sessionId: string): Promise<RecordPoint[]> {
    const events = await db.auditEvent.findMany({
      where: { sessionId, entity: 'session', action: { in: Object.keys(RECORD_ACTIONS) } },
      orderBy: { seq: 'asc' },
      select: { action: true, at: true },
    });
    return events.map((e) => ({ state: RECORD_ACTIONS[e.action], at: e.at }));
  }

  async getForParticipant(sessionId: string, user: AuthUser): Promise<SessionDetailDto> {
    await loadSessionAccess(this.prisma, sessionId, user);
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        matter: true,
        participants: {
          include: { user: true, presenceEvents: { orderBy: { at: 'asc' } } },
          orderBy: { sessionRole: 'asc' },
        },
      },
    });
    const me = session.participants.find((p) => p.userId === user.id)!;
    const record = await this.recordHistory(this.prisma, sessionId);
    const now = new Date();

    return {
      id: session.id,
      matterId: session.matterId,
      caption: session.matter.caption,
      docketNo: session.matter.docketNo,
      forum: session.matter.forum,
      dayNo: session.dayNo,
      startsAt: session.startsAt.toISOString(),
      recordState: session.recordState,
      mySessionRole: me.sessionRole,
      myParticipantId: me.id,
      participants: session.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        role: p.user.role,
        side: p.user.side,
        sessionRole: p.sessionRole,
        verification: p.verification,
        presence: p.presence,
        sworn: p.sworn,
        swornSeconds: swornSeconds(p.presenceEvents, record, now),
      })),
    };
  }

  /** Story "Schedule hearing/deposition": the record officer opens (or reuses) a matter and
   *  creates one session or a recurring series, with its participants. */
  async schedule(input: ScheduleSessionDto, user: AuthUser): Promise<ScheduleResultDto> {
    if (!input.matterId && !input.matter) {
      throw new BlockedException('Provide an existing matterId or a new matter to schedule.', { code: 'schedule.noMatter' });
    }
    const res = await this.commands.run(
      async (tx) => {
        const matter = input.matterId
          ? await tx.matter.findUniqueOrThrow({ where: { id: input.matterId } })
          : await tx.matter.create({ data: input.matter! });
        const agg = await tx.session.aggregate({ where: { matterId: matter.id }, _max: { dayNo: true } });
        let day = agg._max.dayNo ?? 0;
        const count = input.recurrence?.count ?? 1;
        const everyMs = (input.recurrence?.everyDays ?? 7) * 86_400_000;
        let startsAt = new Date(input.startsAt);
        const created = [];
        for (let i = 0; i < count; i++) {
          day += 1;
          const session = await tx.session.create({ data: { matterId: matter.id, dayNo: day, startsAt } });
          for (const p of input.participants) {
            await tx.participant.create({
              data: { sessionId: session.id, userId: p.userId, sessionRole: p.sessionRole as SessionRole },
            });
          }
          created.push(session);
          startsAt = new Date(startsAt.getTime() + everyMs);
        }
        return { matter, created, matterCreated: !input.matterId };
      },
      ({ matter, created, matterCreated }) => {
        const events: AuditInput[] = [];
        if (matterCreated) {
          events.push({
            entity: 'matter', entityId: matter.id, action: 'matter.opened',
            matterId: matter.id, actorId: user.id, data: { docketNo: matter.docketNo, forum: matter.forum },
          });
        }
        for (const s of created) {
          events.push({
            entity: 'session', entityId: s.id, action: 'session.scheduled',
            matterId: matter.id, sessionId: s.id, actorId: user.id,
            data: { dayNo: s.dayNo, startsAt: s.startsAt.toISOString() },
          });
        }
        return events;
      },
    );
    return {
      matterId: res.matter.id,
      docketNo: res.matter.docketNo,
      matterCreated: res.matterCreated,
      sessions: res.created.map((s) => ({ id: s.id, dayNo: s.dayNo, startsAt: s.startsAt.toISOString() })),
    };
  }

  /** Story "Reschedule hearing": the record officer moves a session's start time.
   *  Two hearings on the same day are just two sessions with different start times;
   *  this changes one session's time, allowed only before it goes on the record. */
  async reschedule(sessionId: string, startsAt: string, user: AuthUser): Promise<ScheduledSessionDto> {
    const { updated } = await this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['officer'], 'Rescheduling the hearing');
        if (session.recordState !== 'off') {
          throw new BlockedException(
            session.recordState === 'closed'
              ? 'This session is closed and cannot be rescheduled.'
              : 'A hearing that is on the record cannot be rescheduled. Take it off the record first.',
            { code: 'reschedule.notOff', params: { state: session.recordState } },
          );
        }
        const next = await tx.session.update({ where: { id: sessionId }, data: { startsAt: new Date(startsAt) } });
        return { updated: next, from: session.startsAt };
      },
      ({ updated, from }) => ({
        entity: 'session',
        entityId: updated.id,
        action: 'session.rescheduled',
        matterId: updated.matterId,
        sessionId: updated.id,
        actorId: user.id,
        data: { from: from.toISOString(), to: updated.startsAt.toISOString() },
      }),
    );
    return { id: updated.id, dayNo: updated.dayNo, startsAt: updated.startsAt.toISOString() };
  }

  /** Story "Record state": the record officer takes the session on and off the record. */
  setRecordState(sessionId: string, to: RecordState, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const { session, me } = await loadSessionAccess(tx, sessionId, user);
        requireSessionRole(me, ['officer'], 'Changing the record state');
        if (session.recordState === to) {
          throw new BlockedException(`The session is already ${to === 'open' ? 'on the record' : to}.`, {
            code: 'recordState.already',
            params: { state: to },
          });
        }
        if (session.recordState === 'closed') {
          throw new BlockedException('This session is closed. Closing cannot be undone.', {
            code: 'recordState.closed',
          });
        }
        if (!TRANSITIONS[session.recordState].includes(to)) {
          throw new BlockedException(`A session cannot go from ${session.recordState} to ${to}.`, {
            code: 'recordState.transition',
            params: { from: session.recordState, to },
          });
        }
        const now = new Date();
        const updated = await tx.session.update({
          where: { id: sessionId },
          data: { recordState: to, ...(to === 'closed' && { closedAt: now }) },
        });
        if (to === 'closed') {
          // Closing opens the errata window (spec 1.3).
          await tx.transcriptSeal.create({
            data: { sessionId, errataDeadline: new Date(now.getTime() + this.errataWindowDays * 86_400_000) },
          });
        }
        return { updated, from: session.recordState };
      },
      ({ updated, from }) => ({
        entity: 'session',
        entityId: updated.id,
        action: RECORD_ACTION_FOR[to],
        matterId: updated.matterId,
        sessionId: updated.id,
        actorId: user.id,
        data: { from, to },
      }),
    );
  }

  /** Story "Sworn time accrual": presence controls on the appearance list (record officer). */
  setPresence(participantId: string, state: OfficerPresence, user: AuthUser) {
    return this.commands.run(
      async (tx) => {
        const target = await tx.participant.findUnique({ where: { id: participantId } });
        if (!target) throw new NotFoundException('Participant not found.');
        const { session, me } = await loadSessionAccess(tx, target.sessionId, user);
        requireSessionRole(me, ['officer'], 'Changing presence');
        if (session.recordState === 'closed') {
          throw new BlockedException('This session is closed. Closing cannot be undone.', { code: 'recordState.closed' });
        }
        if (!target.sworn) {
          throw new BlockedException('This participant has not been admitted to the hearing room yet.', {
            code: 'presence.notAdmitted',
          });
        }
        if (target.presence === 'caucus') {
          throw new BlockedException('This participant is in a caucus room.', { code: 'presence.inCaucus' });
        }
        await tx.presenceEvent.create({ data: { participantId, state } });
        await tx.participant.update({ where: { id: participantId }, data: { presence: state } });
        return { session, target };
      },
      ({ session, target }) => ({
        entity: 'participant',
        entityId: target.id,
        action: 'presence.changed',
        matterId: session.matterId,
        sessionId: session.id,
        actorId: user.id,
        data: { from: target.presence, to: state },
      }),
    );
  }
}
