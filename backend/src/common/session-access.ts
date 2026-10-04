import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Participant, Prisma, Session, SessionRole } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/current-user.js';

type Db = Pick<Prisma.TransactionClient, 'participant' | 'session'>;

export interface SessionAccess {
  session: Session;
  me: Participant;
}

/**
 * Loads the session and the caller's participant row. Non-participants get the same
 * 404 as a missing session, so session ids can't be probed.
 */
export async function loadSessionAccess(db: Db, sessionId: string, user: AuthUser): Promise<SessionAccess> {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  const me = session
    ? await db.participant.findUnique({ where: { sessionId_userId: { sessionId, userId: user.id } } })
    : null;
  if (!session || !me) throw new NotFoundException('Session not found.');
  return { session, me };
}

/** Throws 403 unless the caller plays one of these roles in the session. */
export function requireSessionRole(me: Participant, roles: SessionRole[], what: string) {
  if (!roles.includes(me.sessionRole)) {
    throw new ForbiddenException(`${what} is limited to: ${roles.join(', ')}.`);
  }
}

/** Panel members: the presiding adjudicator and panelists. */
export const PANEL_ROLES: SessionRole[] = ['presiding', 'panelist'];
