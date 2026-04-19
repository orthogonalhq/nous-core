/**
 * IConfig profile structural-mirror compatibility test
 * (SP 1.3 / SDS § 6.2 / SDS I2 / F5).
 *
 * Asserts assignment compatibility in BOTH directions between the canonical
 * `UserProfile` declared in `@nous/autonomic-config`'s schema (Zod-derived) and
 * the `AgentUserProfile` structural mirror declared in `@nous/shared`'s
 * `interfaces/autonomic.ts`. The mirror lives in `@nous/shared` because that
 * is where `IConfig` lives; per ADR 018 the shared package must not import
 * from `@nous/autonomic-config`, so a structural mirror is the path that
 * keeps `IConfig.getUserProfile()` typeable without a layering violation.
 *
 * Compile-time pass is the assertion. Mirrors SP 1.2's
 * `shared-interface-compatibility.test.ts` pattern.
 */
import { describe, it, expect } from 'vitest';
import type { AgentUserProfile } from '@nous/shared';
import type { UserProfile } from '../schema.js';

function acceptsAutonomic(profile: UserProfile): UserProfile {
  return profile;
}

function acceptsShared(profile: AgentUserProfile): AgentUserProfile {
  return profile;
}

describe('UserProfile structural-mirror compatibility (SDS I2)', () => {
  it('accepts an autonomic-config UserProfile where AgentUserProfile is expected', () => {
    const autonomic: UserProfile = {
      displayName: 'Andrew',
      role: 'Software Engineer',
    };
    // Compile-time assertion: UserProfile is assignable to AgentUserProfile.
    const shared: AgentUserProfile = autonomic;
    expect(acceptsShared(shared)).toEqual(autonomic);
  });

  it('accepts an AgentUserProfile where UserProfile is expected', () => {
    const shared: AgentUserProfile = {
      displayName: 'Andrew',
      primaryUseCase: 'Building a personal AI agent',
      expertise: 'advanced',
    };
    // Compile-time assertion: AgentUserProfile is assignable to UserProfile.
    const autonomic: UserProfile = shared;
    expect(acceptsAutonomic(autonomic)).toEqual(shared);
  });

  it('round-trips an empty profile in both directions', () => {
    const empty: AgentUserProfile = {};
    const asAutonomic: UserProfile = empty;
    const back: AgentUserProfile = asAutonomic;
    expect(back).toEqual({});
  });
});
