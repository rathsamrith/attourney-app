import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import type {
  CertificateResult,
  CertificateValidator,
  FaceMatchProvider,
  FaceMatchResult,
  FileStorage,
  Signer,
  TimestampAuthority,
} from './providers.js';

/** Development only. Any selfie passes, except one whose text contains "fail". */
@Injectable()
export class FakeFaceMatch implements FaceMatchProvider {
  async match({ participantId, selfie }: { participantId: string; selfie: string }): Promise<FaceMatchResult> {
    const fails = selfie.length === 0 || selfie.includes('fail');
    return {
      score: fails ? 0.42 : 0.97,
      liveness: !fails,
      evidenceRef: `fake-face:${participantId}:${createHash('sha256').update(selfie).digest('hex').slice(0, 16)}`,
    };
  }
}

/** Development only. Any PEM certificate is trusted, unless it contains "REVOKED". */
@Injectable()
export class FakeCertificateValidator implements CertificateValidator {
  async validate(pem: string): Promise<CertificateResult> {
    const isCert = pem.includes('BEGIN CERTIFICATE');
    const revoked = pem.includes('REVOKED');
    return {
      trusted: isCert,
      ocsp: !isCert ? 'unknown' : revoked ? 'revoked' : 'good',
      subject: isCert ? 'CN=Development certificate' : '',
      evidenceRef: `fake-cert:${createHash('sha256').update(pem).digest('hex').slice(0, 16)}`,
    };
  }
}

/** Development only. An Ed25519 key generated per process stands in for the HSM. */
@Injectable()
export class FakeSigner implements Signer {
  private readonly keys: { privateKey: KeyObject; publicKey: KeyObject } = generateKeyPairSync('ed25519');

  async sign(digestHex: string) {
    return sign(null, Buffer.from(digestHex, 'hex'), this.keys.privateKey);
  }

  async verify(digestHex: string, signature: Buffer) {
    return verify(null, Buffer.from(digestHex, 'hex'), this.keys.publicKey, signature);
  }
}

/** Development only. Returns a JSON token instead of an RFC 3161 response. */
@Injectable()
export class FakeTimestampAuthority implements TimestampAuthority {
  async timestamp(digestHex: string) {
    return Buffer.from(JSON.stringify({ tsa: 'fake', digest: digestHex, genTime: new Date().toISOString() }));
  }
}

/** Files on local disk under STORAGE_DIR. */
@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('STORAGE_DIR') ?? './storage');
  }

  private path(key: string) {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error('Invalid storage key');
    return p;
  }

  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return `local:${key}`;
  }

  async get(ref: string) {
    if (!ref.startsWith('local:')) throw new Error(`Unsupported file reference ${ref}`);
    return readFile(this.path(ref.slice('local:'.length)));
  }
}
