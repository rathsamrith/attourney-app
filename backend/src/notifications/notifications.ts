import type { SessionRole } from '../generated/prisma/client.js';

const ALL: SessionRole[] = ['presiding', 'panelist', 'counsel', 'witness', 'officer', 'reporter'];

/**
 * Story "Role notifications": which audit actions each session role is told about.
 * Notifications are derived from audit events; "subject" means the participant the
 * event is about (entityId) is notified too.
 */
export const NOTIFY: Record<string, { roles: SessionRole[]; subject?: boolean }> = {
  'identity.failed': { roles: ['officer'], subject: true },
  'identity.manual_override': { roles: [], subject: true },
  'oath.affirmed': { roles: ['officer'] },
  'participant.admitted': { roles: [], subject: true },
  'record.opened': { roles: ALL },
  'record.recessed': { roles: ALL },
  'session.closed': { roles: ALL },
  'objection.raised': { roles: ['presiding', 'panelist', 'counsel'] },
  'objection.sustained': { roles: ALL },
  'objection.overruled': { roles: ALL },
  'continuance.requested': { roles: ['presiding', 'panelist', 'counsel', 'officer'] },
  'continuance.granted': { roles: ALL },
  'continuance.denied': { roles: ALL },
  'exhibit.offered': { roles: ['presiding', 'panelist', 'counsel', 'officer'] },
  'exhibit.admitted': { roles: ['counsel', 'officer'] },
  'exhibit.excluded': { roles: ['counsel', 'officer'] },
  'exhibit.published': { roles: ALL },
  'ballot.revealed': { roles: ALL },
  'erratum.filed': { roles: ['officer'] },
  'errata.window_closed': { roles: ['officer', 'counsel', 'witness'] },
  'seal.locked': { roles: ALL },
  'export.created': { roles: ['officer'] },
  'audit.tamper_detected': { roles: ['officer'] },
};

export function shouldNotify(action: string, role: SessionRole, iAmSubject: boolean): boolean {
  const rule = NOTIFY[action];
  return !!rule && (rule.roles.includes(role) || (!!rule.subject && iAmSubject));
}
