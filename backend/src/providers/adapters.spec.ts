import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildTimeStampReq, KeySigner } from './adapters.js';

describe('KeySigner', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const digest = 'a'.repeat(64); // 32-byte hex digest

  it('signs a digest and verifies its own signature', async () => {
    const signer = new KeySigner(privateKey, publicKey);
    const sig = await signer.sign(digest);
    expect(sig.length).toBeGreaterThan(0);
    expect(await signer.verify(digest, sig)).toBe(true);
  });

  it('rejects a signature over a different digest', async () => {
    const signer = new KeySigner(privateKey, publicKey);
    const sig = await signer.sign(digest);
    expect(await signer.verify('b'.repeat(64), sig)).toBe(false);
  });

  it('derives the public key from the private key when none is given', async () => {
    const signer = new KeySigner(privateKey);
    expect(await signer.verify(digest, await signer.sign(digest))).toBe(true);
  });
});

describe('buildTimeStampReq (RFC 3161)', () => {
  it('produces a DER SEQUENCE carrying the SHA-256 digest', () => {
    const digest = Buffer.alloc(32, 7);
    const req = buildTimeStampReq(digest);
    expect(req[0]).toBe(0x30); // SEQUENCE
    expect(req.includes(digest)).toBe(true); // hashedMessage present
    expect(req.length).toBeGreaterThan(40);
  });
});
