import { SCREENS, screensFor } from './permissions.js';

const allowed = (role: Parameters<typeof screensFor>[0]) =>
  screensFor(role).filter((s) => s.allowed).map((s) => s.screen);

describe('screensFor', () => {
  it('lists every screen for every role, so blocked screens stay in navigation', () => {
    for (const role of ['adj', 'counsel', 'officer', 'witness'] as const) {
      expect(screensFor(role).map((s) => s.screen)).toEqual([...SCREENS]);
    }
  });

  it('matches the role landing screens in spec 1.1', () => {
    expect(allowed('adj')).toEqual(expect.arrayContaining(['hearing', 'deliberation']));
    expect(allowed('counsel')).toEqual(expect.arrayContaining(['hearing', 'exhibits', 'caucus']));
    expect(allowed('officer')).toEqual(expect.arrayContaining(['hearing', 'sealing', 'docket']));
    expect(allowed('witness')).toEqual(expect.arrayContaining(['checkin', 'hearing']));
  });

  it('keeps the ballot to adjudicators (R6) with a reason for everyone else', () => {
    for (const role of ['counsel', 'officer', 'witness'] as const) {
      const ballot = screensFor(role).find((s) => s.screen === 'deliberation')!;
      expect(ballot.allowed).toBe(false);
      expect(ballot.reason).toMatch(/R6/);
    }
  });
});
