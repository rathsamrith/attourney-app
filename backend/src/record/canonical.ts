import { createHash } from 'node:crypto';
import { canonicalJson } from '../audit/audit-hash.js';

export interface CanonicalLine {
  seq: number;
  at: Date;
  kind: string;
  speakerId: string | null;
  text: string;
}

export interface AcceptedErratum {
  transcriptLineSeq: number;
  corrected: string;
}

/**
 * The exact bytes the transcript digest covers (data dictionary, transcript_seals):
 * the transcript in sequence order with accepted errata applied, one canonical JSON
 * object per line, joined by "\n". Anyone with the export can recompute it.
 */
export function canonicalTranscript(lines: CanonicalLine[], errata: AcceptedErratum[]): string {
  const corrections = new Map(errata.map((e) => [e.transcriptLineSeq, e.corrected]));
  return [...lines]
    .sort((a, b) => a.seq - b.seq)
    .map((l) =>
      canonicalJson({
        seq: l.seq,
        at: l.at.toISOString(),
        kind: l.kind,
        speakerId: l.speakerId,
        text: corrections.get(l.seq) ?? l.text,
      }),
    )
    .join('\n');
}

export function sha256Hex(data: string | Buffer) {
  return createHash('sha256').update(data).digest('hex');
}
