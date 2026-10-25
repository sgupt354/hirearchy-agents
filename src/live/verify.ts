import { createPublicKey, verify } from 'node:crypto';

// Server-only. Discord signs every interaction with Ed25519; we verify with the app's public key using
// node:crypto alone (no extra package). The raw key is wrapped in a fixed SPKI DER prefix for Ed25519.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string, timestamp: string, rawBody: string): boolean {
  try {
    if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex) || !timestamp) return false;
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
