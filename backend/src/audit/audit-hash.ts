import { createHash } from 'node:crypto';

export interface AuditFields {
  at: Date;
  matterId: string | null;
  sessionId: string | null;
  actorId: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  visibilitySide: 'P' | 'D' | 'T' | null;
  data: unknown;
}

/** JSON with object keys sorted at every depth, so the same event always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** hash = SHA-256(prev_hash + canonical event). The first event chains from an empty string. */
export function chainHash(prevHash: string | null, fields: AuditFields): string {
  return createHash('sha256')
    .update(prevHash ?? '')
    .update(canonicalJson(fields))
    .digest('hex');
}
