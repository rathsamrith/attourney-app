import { ConflictException } from '@nestjs/common';

/** Product invariants from the spec, R1 to R8. */
export type RuleCode = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

export interface BlockedBody {
  statusCode: 409;
  error: 'Blocked';
  /** Present when the block comes from one of the numbered rules. */
  rule?: RuleCode;
  /**
   * Stable key the frontend translates (frontend/src/i18n/locales, "blocked.<code>").
   * Absent for database backstops; the frontend then falls back to the rule's text.
   */
  code?: string;
  /** Values interpolated into the translated message. */
  params?: Record<string, string>;
  /** English text, for logs and API consumers without translations. */
  reason: string;
}

export interface BlockedOptions {
  rule?: RuleCode;
  code?: string;
  params?: Record<string, string>;
}

/**
 * A command the user is not allowed to perform in the current state.
 * The frontend renders the translated `code` (or `reason`) next to the disabled control.
 */
export class BlockedException extends ConflictException {
  constructor(reason: string, { rule, code, params }: BlockedOptions = {}) {
    const body: BlockedBody = {
      statusCode: 409,
      error: 'Blocked',
      reason,
      ...(rule && { rule }),
      ...(code && { code }),
      ...(params && { params }),
    };
    super(body);
  }
}
