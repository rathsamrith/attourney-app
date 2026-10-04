import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const CHOICES = ['for_plaintiff', 'for_defense'] as const;
export type Choice = (typeof CHOICES)[number];

/**
 * AES-256-GCM. Output: iv (12) | auth tag (16) | ciphertext.
 * The session and panelist ids are authenticated data, so a ballot can't be moved to
 * another session or panelist without decryption failing.
 */
export function encryptBallot(key: Buffer, choice: Choice, sessionId: string, panelistId: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${sessionId}:${panelistId}`));
  const ct = Buffer.concat([cipher.update(choice, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function decryptBallot(key: Buffer, blob: Buffer, sessionId: string, panelistId: string): Choice {
  const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${sessionId}:${panelistId}`));
  decipher.setAuthTag(blob.subarray(12, 28));
  const choice = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
  if (!(CHOICES as readonly string[]).includes(choice)) throw new Error('Invalid ballot');
  return choice as Choice;
}

/** Majority of the panel decides; anything else is "no majority" (spec 1.5). */
export function outcome(choices: Choice[], panelSize: number): Choice | 'no_majority' {
  for (const c of CHOICES) if (choices.filter((x) => x === c).length * 2 > panelSize) return c;
  return 'no_majority';
}
