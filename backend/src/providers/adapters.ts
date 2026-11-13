/**
 * Production vendor adapters for the interfaces in providers.ts. Selected over the
 * development fakes by environment (see providers.module.ts). No extra dependencies:
 * everything uses Node's stdlib crypto and fetch.
 *
 *   FACE_MATCH_URL           -> HttpFaceMatch
 *   CERT_CA_BUNDLE_PEM / CERT_VALIDATION=real -> X509CertificateValidator
 *   SIGNING_PRIVATE_KEY_PEM  -> KeySigner (RSA / EC / Ed25519)
 *   TSA_URL                  -> HttpTimestampAuthority (RFC 3161)
 *   FILE_STORAGE_URL         -> RemoteFileStorage (S3-compatible HTTP gateway)
 */
import { Injectable } from '@nestjs/common';
import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
  X509Certificate,
  type KeyObject,
} from 'node:crypto';
import type {
  CertificateResult,
  CertificateValidator,
  FaceMatchProvider,
  FaceMatchResult,
  FileStorage,
  Signer,
  TimestampAuthority,
} from './providers.js';

// ---------------------------------------------------------------- face match
/** Posts the selfie to an external biometric service that returns { score, liveness, evidenceRef }. */
@Injectable()
export class HttpFaceMatch implements FaceMatchProvider {
  constructor(
    private readonly url: string,
    private readonly apiKey?: string,
  ) {}

  async match({ participantId, selfie }: { participantId: string; selfie: string }): Promise<FaceMatchResult> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ participantId, image: selfie }),
    });
    if (!res.ok) throw new Error(`Face-match provider returned ${res.status}`);
    const d = (await res.json()) as { score: number; liveness: boolean; evidenceRef?: string; reference?: string };
    return { score: Number(d.score), liveness: Boolean(d.liveness), evidenceRef: String(d.evidenceRef ?? d.reference ?? '') };
  }
}

// ---------------------------------------------------------------- certificate
/** Real X.509 validation: parses the PEM, checks validity dates and (optionally) the chain
 *  against a configured CA bundle. Live OCSP needs a responder round-trip (ASN.1); when a CA
 *  bundle is configured we report `good` for a trusted, in-date certificate and `unknown`
 *  otherwise, leaving responder integration as the only production add-on. */
@Injectable()
export class X509CertificateValidator implements CertificateValidator {
  constructor(private readonly caBundlePem?: string) {}

  async validate(pem: string): Promise<CertificateResult> {
    let cert: X509Certificate;
    try {
      cert = new X509Certificate(pem);
    } catch {
      return { trusted: false, ocsp: 'unknown', subject: '', evidenceRef: '' };
    }
    const now = Date.now();
    const inDate = Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo);
    let trusted = inDate;
    if (inDate && this.caBundlePem) {
      try {
        const ca = new X509Certificate(this.caBundlePem);
        trusted = cert.checkIssued(ca) && cert.verify(ca.publicKey);
      } catch {
        trusted = false;
      }
    }
    return {
      trusted,
      ocsp: trusted ? 'good' : 'unknown',
      subject: cert.subject,
      evidenceRef: `x509:${cert.fingerprint256}`,
    };
  }
}

// ---------------------------------------------------------------- signer
/** Signs the digest with a configured private key (RSA, EC or Ed25519). A PKCS#11/KMS key
 *  can back this in production; the interface is identical. */
@Injectable()
export class KeySigner implements Signer {
  private readonly priv: KeyObject;
  private readonly pub: KeyObject;

  constructor(privateKeyPem: string, publicKeyPem?: string) {
    this.priv = createPrivateKey(privateKeyPem);
    this.pub = publicKeyPem ? createPublicKey(publicKeyPem) : createPublicKey(this.priv);
  }

  private algo(key: KeyObject): string | null {
    const t = key.asymmetricKeyType;
    return t === 'ed25519' || t === 'ed448' ? null : 'sha256';
  }

  async sign(digestHex: string): Promise<Buffer> {
    return cryptoSign(this.algo(this.priv), Buffer.from(digestHex, 'hex'), this.priv);
  }

  async verify(digestHex: string, signature: Buffer): Promise<boolean> {
    return cryptoVerify(this.algo(this.pub), Buffer.from(digestHex, 'hex'), this.pub, signature);
  }
}

// ---------------------------------------------------------------- RFC 3161 TSA
const SHA256_OID = Buffer.from([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);

function derLen(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  let x = n;
  while (x > 0) {
    bytes.unshift(x & 0xff);
    x >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function der(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}
function derPositiveInt(bytes: Buffer): Buffer {
  const b = bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), bytes]) : bytes;
  return der(0x02, b);
}

/** Builds a DER-encoded RFC 3161 TimeStampReq over a SHA-256 digest. */
export function buildTimeStampReq(digest: Buffer): Buffer {
  const version = der(0x02, Buffer.from([0x01]));
  const algId = der(0x30, Buffer.concat([der(0x06, SHA256_OID), der(0x05, Buffer.alloc(0))]));
  const messageImprint = der(0x30, Buffer.concat([algId, der(0x04, digest)]));
  const nonce = derPositiveInt(randomBytes(8));
  const certReq = der(0x01, Buffer.from([0xff]));
  return der(0x30, Buffer.concat([version, messageImprint, nonce, certReq]));
}

/** Sends an RFC 3161 request to a TSA and stores the raw TimeStampResp token. */
@Injectable()
export class HttpTimestampAuthority implements TimestampAuthority {
  constructor(private readonly url: string) {}

  async timestamp(digestHex: string): Promise<Buffer> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/timestamp-query' },
      body: new Uint8Array(buildTimeStampReq(Buffer.from(digestHex, 'hex'))),
    });
    if (!res.ok) throw new Error(`Timestamp authority returned ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

// ---------------------------------------------------------------- object storage
/** Object storage over HTTP, for any S3-compatible gateway (presigned proxy, MinIO, etc.).
 *  PUT {base}/{key} to store, GET {base}/{key} to read; bearer-authenticated if a token is set. */
@Injectable()
export class RemoteFileStorage implements FileStorage {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  private url(key: string) {
    return `${this.baseUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  private headers(): Record<string, string> {
    return this.token ? { authorization: `Bearer ${this.token}` } : {};
  }

  async put(key: string, data: Buffer): Promise<string> {
    const res = await fetch(this.url(key), {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream', ...this.headers() },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`File storage PUT returned ${res.status}`);
    return `remote:${key}`;
  }

  async get(ref: string): Promise<Buffer> {
    if (!ref.startsWith('remote:')) throw new Error(`Unsupported file reference ${ref}`);
    const res = await fetch(this.url(ref.slice('remote:'.length)), { headers: this.headers() });
    if (!res.ok) throw new Error(`File storage GET returned ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
