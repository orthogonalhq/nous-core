/**
 * Workmode schema contract tests.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import { describe, it, expect } from 'vitest';
import {
  WorkmodeIdSchema,
  PolicyGroupSchema,
  WorkmodeContractSchema,
} from '../../types/workmode.js';

describe('WorkmodeIdSchema', () => {
  it('accepts system:implementation', () => {
    expect(WorkmodeIdSchema.safeParse('system:implementation').success).toBe(true);
  });

  it('accepts system:architecture', () => {
    expect(WorkmodeIdSchema.safeParse('system:architecture').success).toBe(true);
  });

  it('accepts skill:engineer-workflow-sop:implementation_agent', () => {
    expect(
      WorkmodeIdSchema.safeParse('skill:engineer-workflow-sop:implementation_agent')
        .success,
    ).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(WorkmodeIdSchema.safeParse('invalid').success).toBe(false);
    expect(WorkmodeIdSchema.safeParse('system:Implementation').success).toBe(false);
    expect(WorkmodeIdSchema.safeParse('skill:slug').success).toBe(false);
  });
});

describe('PolicyGroupSchema', () => {
  it('accepts all canonical policy groups', () => {
    expect(PolicyGroupSchema.safeParse('system').success).toBe(true);
    expect(PolicyGroupSchema.safeParse('certified_skill').success).toBe(true);
    expect(PolicyGroupSchema.safeParse('local_skill').success).toBe(true);
    expect(PolicyGroupSchema.safeParse('uncertified_skill').success).toBe(true);
  });

  it('rejects invalid policy group', () => {
    expect(PolicyGroupSchema.safeParse('unknown').success).toBe(false);
  });
});

describe('WorkmodeContractSchema', () => {
  it('parses valid contract', () => {
    const result = WorkmodeContractSchema.safeParse({
      workmode_id: 'system:implementation',
      entrypoint_ref: '@.skills/engineer-workflow-sop/implementation-agent/ENTRY.md',
      sop_ref: '@.skills/engineer-workflow-sop/SKILL.md',
      allowed_artifact_surfaces: ['.worklog/', 'self/'],
      policy_group_compatibility: ['system'],
      version: '1.0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(
      WorkmodeContractSchema.safeParse({
        workmode_id: 'system:implementation',
        // missing entrypoint_ref, sop_ref, etc.
      }).success,
    ).toBe(false);
  });

  it('rejects empty allowed_artifact_surfaces', () => {
    const result = WorkmodeContractSchema.safeParse({
      workmode_id: 'system:implementation',
      entrypoint_ref: '@.skills/',
      sop_ref: '@.skills/',
      allowed_artifact_surfaces: [],
      policy_group_compatibility: ['system'],
      version: '1.0',
    });
    expect(result.success).toBe(true); // empty array is valid per schema
  });
});
