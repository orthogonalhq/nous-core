/**
 * Recovery segment schema contract tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import {
  RecoverySegmentSchema,
  RECOVERY_HASH_REGEX,
} from '../../types/recovery-segment.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const HASH = 'a'.repeat(64);
const NOW = new Date().toISOString();

describe('RECOVERY_HASH_REGEX', () => {
  it('accepts 64-char lowercase hex', () => {
    expect(RECOVERY_HASH_REGEX.test(HASH)).toBe(true);
    expect(RECOVERY_HASH_REGEX.test('b'.repeat(64))).toBe(true);
  });

  it('rejects invalid hash', () => {
    expect(RECOVERY_HASH_REGEX.test('a'.repeat(63))).toBe(false);
    expect(RECOVERY_HASH_REGEX.test('A'.repeat(64))).toBe(false);
    expect(RECOVERY_HASH_REGEX.test('g'.repeat(64))).toBe(false);
  });
});

describe('RecoverySegmentSchema', () => {
  it('parses valid segment', () => {
    const result = RecoverySegmentSchema.safeParse({
      segment_id: UUID,
      segment_seq_start: 0,
      segment_seq_end: 10,
      prev_segment_hash: null,
      segment_hash: HASH,
      sealed_at: NOW,
    });
    expect(result.success).toBe(true);
  });

  it('accepts sealed_at null', () => {
    const result = RecoverySegmentSchema.safeParse({
      segment_id: UUID,
      segment_seq_start: 0,
      segment_seq_end: 10,
      prev_segment_hash: HASH,
      segment_hash: 'b'.repeat(64),
      sealed_at: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid segment_hash', () => {
    const result = RecoverySegmentSchema.safeParse({
      segment_id: UUID,
      segment_seq_start: 0,
      segment_seq_end: 10,
      prev_segment_hash: null,
      segment_hash: 'invalid',
      sealed_at: null,
    });
    expect(result.success).toBe(false);
  });
});
