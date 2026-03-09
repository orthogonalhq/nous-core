import { createHash } from 'node:crypto';
import type {
  ArtifactContentEncoding,
  ArtifactId,
} from '@nous/shared';

export interface EncodedArtifactData {
  bytes: Uint8Array;
  storedBase64: string;
}

export function encodeArtifactData(
  data: Uint8Array | string,
  contentEncoding: ArtifactContentEncoding,
): EncodedArtifactData {
  if (data instanceof Uint8Array) {
    const bytes = new Uint8Array(data);
    return {
      bytes,
      storedBase64: Buffer.from(bytes).toString('base64'),
    };
  }

  if (contentEncoding === 'base64') {
    const bytes = Uint8Array.from(Buffer.from(data, 'base64'));
    return {
      bytes,
      storedBase64: Buffer.from(bytes).toString('base64'),
    };
  }

  const bytes = Uint8Array.from(Buffer.from(data, 'utf8'));
  return {
    bytes,
    storedBase64: Buffer.from(bytes).toString('base64'),
  };
}

export function decodeArtifactData(
  storedBase64: string,
  contentEncoding: ArtifactContentEncoding,
): Uint8Array | string {
  const bytes = Uint8Array.from(Buffer.from(storedBase64, 'base64'));
  if (contentEncoding === 'binary') {
    return bytes;
  }
  if (contentEncoding === 'base64') {
    return Buffer.from(bytes).toString('base64');
  }
  return Buffer.from(bytes).toString('utf8');
}

export function computeIntegrityRef(
  data: Uint8Array | string,
  contentEncoding: ArtifactContentEncoding,
): string {
  const { bytes } = encodeArtifactData(data, contentEncoding);
  const digest = createHash('sha256').update(bytes).digest('hex');
  return `sha256:${digest}`;
}

export function buildArtifactRef(
  artifactId: ArtifactId,
  version: number,
): string {
  return `artifact://${artifactId}/v${version}`;
}
