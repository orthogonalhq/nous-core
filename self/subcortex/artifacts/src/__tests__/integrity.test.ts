import { describe, expect, it } from 'vitest';
import {
  buildArtifactRef,
  computeIntegrityRef,
  decodeArtifactData,
  encodeArtifactData,
} from '../integrity.js';

describe('artifact integrity helpers', () => {
  it('computes deterministic sha256 integrity refs for utf8 content', () => {
    expect(computeIntegrityRef('hello world', 'utf8')).toBe(
      'sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('encodes and decodes binary and base64 payloads', () => {
    const binary = new Uint8Array([1, 2, 3]);
    const encodedBinary = encodeArtifactData(binary, 'binary');
    expect(Array.from(decodeArtifactData(encodedBinary.storedBase64, 'binary') as Uint8Array)).toEqual([
      1, 2, 3,
    ]);

    const encodedBase64 = encodeArtifactData('AQID', 'base64');
    expect(decodeArtifactData(encodedBase64.storedBase64, 'base64')).toBe('AQID');
  });

  it('builds canonical artifact refs', () => {
    expect(buildArtifactRef('550e8400-e29b-41d4-a716-446655442001' as any, 3)).toBe(
      'artifact://550e8400-e29b-41d4-a716-446655442001/v3',
    );
  });
});
