import { canonicalTranscript, sha256Hex } from './canonical.js';

const line = (seq: number, text: string) => ({ seq, at: new Date(Date.UTC(2026, 9, 4, 13, seq)), kind: 'a', speakerId: null, text });

describe('canonicalTranscript', () => {
  it('orders by sequence regardless of input order', () => {
    expect(canonicalTranscript([line(2, 'b'), line(1, 'a')], [])).toBe(canonicalTranscript([line(1, 'a'), line(2, 'b')], []));
  });

  it('applies accepted errata, which changes the digest', () => {
    const lines = [line(1, 'I was in Oslo.'), line(2, 'Yes.')];
    const corrected = canonicalTranscript(lines, [{ transcriptLineSeq: 1, corrected: 'I was in Bergen.' }]);
    expect(corrected).toContain('I was in Bergen.');
    expect(corrected).not.toContain('Oslo');
    expect(sha256Hex(corrected)).not.toBe(sha256Hex(canonicalTranscript(lines, [])));
  });

  it('puts one line per transcript line', () => {
    expect(canonicalTranscript([line(1, 'a'), line(2, 'b'), line(3, 'c')], []).split('\n')).toHaveLength(3);
  });
});
