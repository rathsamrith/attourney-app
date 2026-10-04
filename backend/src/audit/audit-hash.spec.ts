import { canonicalJson, chainHash, type AuditFields } from './audit-hash.js';

const base: AuditFields = {
  at: new Date('2026-10-04T13:00:00.000Z'),
  matterId: null,
  sessionId: '6f2c0d4e-0000-4000-8000-000000000001',
  actorId: null,
  entity: 'session',
  entityId: null,
  action: 'record.opened',
  visibilitySide: null,
  data: { from: 'off', to: 'open' },
};

describe('canonicalJson', () => {
  it('sorts keys at every depth so key order never changes the hash', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('renders dates as ISO strings and drops undefined', () => {
    expect(canonicalJson({ at: new Date(0), x: undefined })).toBe('{"at":"1970-01-01T00:00:00.000Z"}');
  });
});

describe('chainHash', () => {
  it('is deterministic', () => {
    expect(chainHash(null, base)).toBe(chainHash(null, { ...base }));
  });

  it('changes when any field or the previous hash changes', () => {
    const h = chainHash(null, base);
    expect(chainHash('abc', base)).not.toBe(h);
    expect(chainHash(null, { ...base, action: 'record.went_off' })).not.toBe(h);
    expect(chainHash(null, { ...base, data: { from: 'off', to: 'recess' } })).not.toBe(h);
  });
});
