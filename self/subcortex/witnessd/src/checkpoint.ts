/**
 * Checkpoint signing helpers and key-epoch lifecycle persistence.
 */
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { z } from 'zod';
import type { IDocumentStore } from '@nous/shared';

export const WITNESS_KEY_EPOCHS_COLLECTION = 'witness_key_epochs';

const KeyEpochRecordSchema = z.object({
  keyEpoch: z.number().int().positive(),
  publicKeyPem: z.string().min(1),
  privateKeyPem: z.string().min(1),
  createdAt: z.string().datetime(),
  activatedAt: z.string().datetime(),
});
export type KeyEpochRecord = z.infer<typeof KeyEpochRecordSchema>;

export function createKeyPairPem(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
  };
}

export function signDigest(
  digestHex: string,
  privateKeyPem: string,
): string {
  const signature = sign(null, Buffer.from(digestHex, 'utf8'), privateKeyPem);
  return signature.toString('base64');
}

export function verifyDigestSignature(
  digestHex: string,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  return verify(
    null,
    Buffer.from(digestHex, 'utf8'),
    publicKeyPem,
    Buffer.from(signatureBase64, 'base64'),
  );
}

export async function ensureKeyEpoch(
  documentStore: IDocumentStore,
  keyEpoch: number,
  now: string,
): Promise<KeyEpochRecord> {
  const existing = await getKeyEpoch(documentStore, keyEpoch);
  if (existing) {
    return existing;
  }

  const keyPair = createKeyPairPem();
  const record = KeyEpochRecordSchema.parse({
    keyEpoch,
    publicKeyPem: keyPair.publicKeyPem,
    privateKeyPem: keyPair.privateKeyPem,
    createdAt: now,
    activatedAt: now,
  });

  await documentStore.put(WITNESS_KEY_EPOCHS_COLLECTION, String(keyEpoch), record);
  return record;
}

export async function getKeyEpoch(
  documentStore: IDocumentStore,
  keyEpoch: number,
): Promise<KeyEpochRecord | null> {
  const raw = await documentStore.get<unknown>(
    WITNESS_KEY_EPOCHS_COLLECTION,
    String(keyEpoch),
  );
  if (!raw) {
    return null;
  }

  const parsed = KeyEpochRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
