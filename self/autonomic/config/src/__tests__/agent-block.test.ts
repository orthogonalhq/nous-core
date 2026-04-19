/**
 * Schema-shape baseline tests for the SP 1.3 `agent` block
 * (Goals C1-C5; SDS § 6.1 Block H).
 *
 * Block H asserts that the SystemConfigSchema extension is shaped correctly,
 * the missing-block contract holds, the profile schema is typed-and-strict,
 * and the personality structural mirror is consistent (delegated to
 * `personality-mirror-compat.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import {
  AgentBlockSchema,
  PersonalityConfigSchema,
  SystemConfigSchema,
  UserProfileSchema,
} from '../schema.js';
import { DEFAULT_SYSTEM_CONFIG } from '../defaults.js';

describe('SP 1.3 agent block — schema shape (Block H)', () => {
  // H1
  it('SystemConfigSchema has an optional top-level `agent` field', () => {
    expect(SystemConfigSchema.shape.agent).toBeDefined();
    // The optional() wrapper exposes the inner schema via .unwrap() in zod.
    // We assert by attempting to parse a config with the agent field absent.
    const candidate = { ...DEFAULT_SYSTEM_CONFIG };
    const result = SystemConfigSchema.safeParse(candidate);
    expect(result.success).toBe(true);
  });

  // H2
  it('a baseline config without an `agent` key parses successfully', () => {
    const baseline = { ...DEFAULT_SYSTEM_CONFIG };
    expect(() => SystemConfigSchema.parse(baseline)).not.toThrow();
  });

  // H3
  it('DEFAULT_SYSTEM_CONFIG does NOT contain an `agent` entry', () => {
    expect((DEFAULT_SYSTEM_CONFIG as { agent?: unknown }).agent).toBeUndefined();
    expect('agent' in DEFAULT_SYSTEM_CONFIG).toBe(false);
  });

  // H4
  it('UserProfileSchema is .strict() — unknown keys are rejected', () => {
    // Zod .strict() rejects unknown keys. This is the binding behaviour for
    // catching wizard typos at write time (Decision 7 § Profile Schema
    // Constraints, F6 mitigation).
    const result = UserProfileSchema.safeParse({
      displayName: 'Andrew',
      // unknown key — strict() should reject
      displayname: 'should-fail',
    });
    expect(result.success).toBe(false);
  });

  it('UserProfileSchema accepts the V1 roster fields, all optional', () => {
    expect(() => UserProfileSchema.parse({})).not.toThrow();
    expect(() => UserProfileSchema.parse({ displayName: 'Andrew' })).not.toThrow();
    expect(() => UserProfileSchema.parse({
      displayName: 'Andrew',
      role: 'Software Engineer',
      primaryUseCase: 'Building Nous',
      expertise: 'advanced',
    })).not.toThrow();
  });

  it('AgentBlockSchema accepts partial blocks (every nested field optional)', () => {
    expect(() => AgentBlockSchema.parse({})).not.toThrow();
    expect(() => AgentBlockSchema.parse({ name: 'Nia' })).not.toThrow();
    expect(() => AgentBlockSchema.parse({
      personality: { preset: 'professional' },
    })).not.toThrow();
    expect(() => AgentBlockSchema.parse({
      welcomeMessageSent: true,
    })).not.toThrow();
    expect(() => AgentBlockSchema.parse({
      profile: { displayName: 'Andrew' },
    })).not.toThrow();
  });

  it('PersonalityConfigSchema requires a preset; overrides optional', () => {
    expect(() => PersonalityConfigSchema.parse({ preset: 'balanced' })).not.toThrow();
    expect(() => PersonalityConfigSchema.parse({
      preset: 'professional',
      overrides: { thoroughness: 'strict' },
    })).not.toThrow();
    // Missing preset
    const missingPreset = PersonalityConfigSchema.safeParse({});
    expect(missingPreset.success).toBe(false);
    // Invalid preset
    const invalidPreset = PersonalityConfigSchema.safeParse({ preset: 'invalid' });
    expect(invalidPreset.success).toBe(false);
  });

  it('TraitAxesOverrides is .strict() — unknown trait keys rejected', () => {
    const result = PersonalityConfigSchema.safeParse({
      preset: 'balanced',
      overrides: { typo: 'value' },
    });
    expect(result.success).toBe(false);
  });

  it('SystemConfigSchema accepts a config with a populated `agent` block', () => {
    const candidate = {
      ...DEFAULT_SYSTEM_CONFIG,
      agent: {
        name: 'Nia',
        personality: { preset: 'professional' as const },
        welcomeMessageSent: false,
        profile: { displayName: 'Andrew' },
      },
    };
    expect(() => SystemConfigSchema.parse(candidate)).not.toThrow();
  });
});
