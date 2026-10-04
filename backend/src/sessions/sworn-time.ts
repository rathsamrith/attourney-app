import type { Presence, RecordState } from '../generated/prisma/client.js';

export interface PresencePoint {
  state: Presence;
  at: Date;
}

export interface RecordPoint {
  state: RecordState;
  at: Date;
}

/** Presence states that accrue sworn time (R2): sidebar keeps accruing, caucus and absence do not. */
const ACCRUING: ReadonlySet<Presence> = new Set<Presence>(['present', 'sidebar']);

/**
 * Sworn seconds for one participant (R2): time spent present or in sidebar while the
 * session is on the record. Computed only from server-recorded events, never client clocks.
 * Participants start in the lobby and sessions start off the record.
 */
export function swornSeconds(presence: PresencePoint[], record: RecordPoint[], now: Date): number {
  type Change = { at: number; presence?: Presence; record?: RecordState };
  const changes: Change[] = [
    ...presence.map((p) => ({ at: p.at.getTime(), presence: p.state })),
    ...record.map((r) => ({ at: r.at.getTime(), record: r.state })),
  ].sort((a, b) => a.at - b.at);

  let currentPresence: Presence = 'lobby';
  let currentRecord: RecordState = 'off';
  let since = changes[0]?.at ?? now.getTime();
  let ms = 0;

  const close = (until: number) => {
    if (ACCRUING.has(currentPresence) && currentRecord === 'open' && until > since) ms += until - since;
  };

  for (const c of changes) {
    close(c.at);
    since = c.at;
    if (c.presence) currentPresence = c.presence;
    if (c.record) currentRecord = c.record;
  }
  close(Math.max(now.getTime(), since));
  return Math.floor(ms / 1000);
}

/** Audit actions that change the record state, mapped to the resulting state. */
export const RECORD_ACTIONS: Record<string, RecordState> = {
  'record.opened': 'open',
  'record.went_off': 'off',
  'record.recessed': 'recess',
  'session.closed': 'closed',
};
