/**
 * Phase 4.4: Reversal audit caller contract verification.
 * Asserts that the reverseSupersession caller contract is documented and
 * that callers are aware of the audit emission requirement (ADR-002).
 */
import { describe, it, expect } from 'vitest';
import {
  reverseSupersession,
  REVERSAL_AUDIT_CALLER_CONTRACT,
} from '../supersession-reversal.js';

describe('Phase 4.4 reversal audit verification', () => {
  it('REVERSAL_AUDIT_CALLER_CONTRACT is documented', () => {
    expect(REVERSAL_AUDIT_CALLER_CONTRACT).toBeDefined();
    expect(typeof REVERSAL_AUDIT_CALLER_CONTRACT).toBe('string');
    expect(REVERSAL_AUDIT_CALLER_CONTRACT.length).toBeGreaterThan(0);
    expect(REVERSAL_AUDIT_CALLER_CONTRACT).toContain('MemoryMutationAuditRecord');
    expect(REVERSAL_AUDIT_CALLER_CONTRACT).toContain('reverseSupersession');
  });

  it('reverseSupersession is exported and callable', () => {
    expect(typeof reverseSupersession).toBe('function');
  });

  it('caller contract references export-hooks document', () => {
    // Contract is documented in supersession-reversal.ts JSDoc and
    // .worklog/phase-4/phase-4.4/export-hooks.mdx
    expect(REVERSAL_AUDIT_CALLER_CONTRACT).toBe(
      'Caller must emit MemoryMutationAuditRecord when invoking reverseSupersession',
    );
  });
});
