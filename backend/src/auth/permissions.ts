import type { UserRole } from '../generated/prisma/client.js';

/**
 * Role-scoped navigation (spec 1.1 and story "Role-scoped navigation").
 * Screens outside a role stay in the navigation, marked blocked with the reason.
 * This is the single source for the frontend's navigation; API routes enforce
 * the same limits with @Roles().
 */
export const SCREENS = [
  'checkin',
  'hearing',
  'exhibits',
  'caucus',
  'deliberation',
  'sealing',
  'docket',
  'audit',
] as const;
export type Screen = (typeof SCREENS)[number];

const ALL: UserRole[] = ['adj', 'counsel', 'officer', 'witness'];

const RULES: Record<Screen, { roles: UserRole[]; blockedReason: string }> = {
  checkin: { roles: ALL, blockedReason: '' },
  hearing: { roles: ALL, blockedReason: '' },
  exhibits: {
    roles: ['counsel', 'adj'],
    blockedReason: 'Exhibits are tagged and offered by counsel and ruled on by the tribunal.',
  },
  caucus: {
    roles: ['counsel'],
    blockedReason: 'Caucus rooms are for counsel conferring with their own side.',
  },
  deliberation: {
    roles: ['adj'],
    blockedReason: 'Only adjudicators can see or cast the ballot (R6).',
  },
  sealing: {
    roles: ['officer'],
    blockedReason: 'Errata, the hash lock and certified export are record officer actions.',
  },
  docket: {
    roles: ['officer'],
    blockedReason: 'The docket is kept by the record officer.',
  },
  audit: { roles: ALL, blockedReason: '' },
};

export interface ScreenAccess {
  screen: Screen;
  allowed: boolean;
  /** Empty when allowed. */
  reason: string;
}

export function screensFor(role: UserRole): ScreenAccess[] {
  return SCREENS.map((screen) => {
    const allowed = RULES[screen].roles.includes(role);
    return { screen, allowed, reason: allowed ? '' : RULES[screen].blockedReason };
  });
}
