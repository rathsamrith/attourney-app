import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DocketSessionDto, DocketWeekDto, MetricDto } from './docket.dto.js';

const DAY = 86_400_000;

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - offset * DAY);
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

/** Epic E6: the clerk's week view and summary metrics. */
@Injectable()
export class DocketService {
  constructor(private readonly prisma: PrismaService) {}

  async week(weekOf: Date): Promise<DocketWeekDto> {
    const start = weekStart(weekOf);
    const end = new Date(start.getTime() + 7 * DAY);
    const sessions = await this.prisma.session.findMany({
      where: { startsAt: { gte: start, lt: end } },
      include: { matter: true, seal: { include: { _count: { select: { exports: true } } } } },
      orderBy: { startsAt: 'asc' },
    });

    const toDto = (s: (typeof sessions)[number]): DocketSessionDto => ({
      id: s.id,
      caption: s.matter.caption,
      docketNo: s.matter.docketNo,
      forum: s.matter.forum,
      dayNo: s.dayNo,
      startsAt: s.startsAt.toISOString(),
      recordState: s.recordState,
      sealStatus: !s.seal
        ? 'in_progress'
        : s.seal._count.exports > 0
          ? 'exported'
          : s.seal.lockedAt
            ? 'locked'
            : s.seal.errataClosedAt
              ? 'ready_to_lock'
              : 'errata_open',
    });

    return {
      weekStart: start.toISOString().slice(0, 10),
      days: Array.from({ length: 7 }, (_, i) => {
        const dayStart = new Date(start.getTime() + i * DAY);
        const dayEnd = new Date(dayStart.getTime() + DAY);
        return {
          date: dayStart.toISOString().slice(0, 10),
          sessions: sessions.filter((s) => s.startsAt >= dayStart && s.startsAt < dayEnd).map(toDto),
        };
      }),
    };
  }

  /** Story "Summary metrics": each states its numerator, denominator and period. */
  async metrics(from: Date, to: Date): Promise<MetricDto[]> {
    const period = { periodFrom: from.toISOString(), periodTo: to.toISOString() };
    const between = { gte: from, lt: to };

    const [checks, passed, sessions, objections, ruled, granted, seals] = await Promise.all([
      this.prisma.identityCheck.count({ where: { at: between, method: { not: 'manual' } } }),
      this.prisma.identityCheck.count({ where: { at: between, method: { not: 'manual' }, result: 'pass' } }),
      this.prisma.session.count({ where: { startsAt: between } }),
      this.prisma.objection.count({ where: { session: { startsAt: between } } }),
      this.prisma.continuance.count({ where: { ruledAt: between } }),
      this.prisma.continuance.count({ where: { ruledAt: between, status: 'granted' } }),
      this.prisma.transcriptSeal.findMany({
        where: { lockedAt: between },
        include: { session: { select: { closedAt: true } } },
      }),
    ]);
    const lockHours = seals
      .filter((s) => s.session.closedAt && s.lockedAt)
      .map((s) => (s.lockedAt!.getTime() - s.session.closedAt!.getTime()) / 3_600_000);
    const totalHours = lockHours.reduce((a, b) => a + b, 0);

    return [
      { key: 'verificationPassRate', value: ratio(passed, checks), numerator: passed, denominator: checks, ...period },
      { key: 'objectionsPerSession', value: ratio(objections, sessions), numerator: objections, denominator: sessions, ...period },
      { key: 'continuanceGrantRate', value: ratio(granted, ruled), numerator: granted, denominator: ruled, ...period },
      {
        key: 'meanHoursToHashLock',
        value: ratio(totalHours, lockHours.length),
        numerator: Math.round(totalHours * 100) / 100,
        denominator: lockHours.length,
        ...period,
      },
    ];
  }
}
