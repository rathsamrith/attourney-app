import { randomBytes } from 'node:crypto';
import { decryptBallot, encryptBallot, outcome } from './ballot-crypto.js';

const key = randomBytes(32);

describe('ballot encryption (R6)', () => {
  it('round-trips a choice', () => {
    expect(decryptBallot(key, encryptBallot(key, 'for_defense', 's1', 'u1'), 's1', 'u1')).toBe('for_defense');
  });

  it('produces different ciphertext each time, so equal votes are not recognisable', () => {
    expect(encryptBallot(key, 'for_plaintiff', 's1', 'u1').equals(encryptBallot(key, 'for_plaintiff', 's1', 'u1'))).toBe(false);
  });

  it('fails if the ballot is moved to another panelist or session', () => {
    const blob = encryptBallot(key, 'for_plaintiff', 's1', 'u1');
    expect(() => decryptBallot(key, blob, 's1', 'u2')).toThrow();
    expect(() => decryptBallot(key, blob, 's2', 'u1')).toThrow();
  });
});

describe('outcome', () => {
  it('needs a strict majority of the panel', () => {
    expect(outcome(['for_plaintiff', 'for_plaintiff', 'for_defense'], 3)).toBe('for_plaintiff');
    expect(outcome(['for_plaintiff', 'for_defense'], 2)).toBe('no_majority');
  });
});
