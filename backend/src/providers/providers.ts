/**
 * Vendor integrations behind interfaces. Development and tests use the deterministic
 * fakes in fakes.ts; production adapters implement the same interfaces.
 * Inject with @Inject(TOKEN).
 */

export const FACE_MATCH = Symbol('FaceMatchProvider');
export const CERTIFICATE_VALIDATOR = Symbol('CertificateValidator');
export const SIGNER = Symbol('Signer');
export const TIMESTAMP_AUTHORITY = Symbol('TimestampAuthority');
export const FILE_STORAGE = Symbol('FileStorage');

export interface FaceMatchResult {
  /** 0 to 1. The spec requires 0.90 or more. */
  score: number;
  liveness: boolean;
  /** Opaque reference to the evidence kept by the provider. */
  evidenceRef: string;
}

/** Biometric face match with liveness against the participant's identity document. */
export interface FaceMatchProvider {
  match(input: { participantId: string; selfie: string }): Promise<FaceMatchResult>;
}

export interface CertificateResult {
  /** Chains to a trusted CA. */
  trusted: boolean;
  /** OCSP status. */
  ocsp: 'good' | 'revoked' | 'unknown';
  subject: string;
  evidenceRef: string;
}

/** Digital certificate validation with OCSP. */
export interface CertificateValidator {
  validate(pem: string): Promise<CertificateResult>;
}

/** HSM-backed signature over a digest. */
export interface Signer {
  sign(digestHex: string): Promise<Buffer>;
  verify(digestHex: string, signature: Buffer): Promise<boolean>;
}

/** RFC 3161 time-stamp authority. */
export interface TimestampAuthority {
  timestamp(digestHex: string): Promise<Buffer>;
}

/** Object storage for exhibits and certified exports (S3 in production). */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<string>;
  get(ref: string): Promise<Buffer>;
}
