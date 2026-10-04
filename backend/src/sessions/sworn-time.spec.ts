import { swornSeconds, type PresencePoint, type RecordPoint } from './sworn-time.js';

const at = (min: number) => new Date(Date.UTC(2026, 9, 4, 13, min));
const p = (state: PresencePoint['state'], min: number): PresencePoint => ({ state, at: at(min) });
const r = (state: RecordPoint['state'], min: number): RecordPoint => ({ state, at: at(min) });

describe('swornSeconds (R2)', () => {
  it('accrues only while present and on the record', () => {
    expect(swornSeconds([p('present', 0)], [r('open', 10), r('off', 25)], at(60))).toBe(15 * 60);
  });

  it('keeps accruing in sidebar', () => {
    expect(swornSeconds([p('present', 0), p('sidebar', 5)], [r('open', 0)], at(10))).toBe(10 * 60);
  });

  it('stops for caucus and absence', () => {
    const presence = [p('present', 0), p('caucus', 10), p('present', 20), p('absent', 30)];
    expect(swornSeconds(presence, [r('open', 0)], at(40))).toBe(20 * 60);
  });

  it('pauses for everyone during recess and stops at close', () => {
    expect(swornSeconds([p('present', 0)], [r('open', 0), r('recess', 10), r('open', 20), r('closed', 25)], at(90))).toBe(
      15 * 60,
    );
  });

  it('accrues up to now while the interval is still open', () => {
    expect(swornSeconds([p('present', 0)], [r('open', 0)], at(7))).toBe(7 * 60);
  });

  it('accrues nothing in the lobby or with no events', () => {
    expect(swornSeconds([], [r('open', 0)], at(30))).toBe(0);
    expect(swornSeconds([], [], at(30))).toBe(0);
  });

  it('ignores the order events arrive in', () => {
    expect(swornSeconds([p('absent', 20), p('present', 0)], [r('open', 0)], at(30))).toBe(20 * 60);
  });
});
