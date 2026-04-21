// First-run identity-write tRPC procedure tests
// (Goals C26-C28; SDS § 6.6 T1-T4 + F1).
//
// Per implementation plan task 31. Note: the plan's path was
// `src/__tests__/trpc/first-run.identity.test.ts`; the shared-server's
// vitest config uses the `__tests__/...test.ts` glob so this file lives at
// `self/apps/shared-server/__tests__/first-run-identity.test.ts` to be
// picked up. Documented as a deviation in the Completion Report.
//
// Uses a real ConfigManager with a temp-file configPath and a real dataDir
// for wizard state. Calls the tRPC procedure via the router's caller.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigManager, DEFAULT_SYSTEM_CONFIG } from '@nous/autonomic-config';
import { firstRunRouter } from '../src/trpc/routers/first-run';
import { getFirstRunState } from '../src/first-run';

let testDirs: string[] = [];

function createScaffold() {
  const dir = join(
    tmpdir(),
    'nous-fr-identity-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
  );
  mkdirSync(dir, { recursive: true });
  testDirs.push(dir);

  const configPath = join(dir, 'nous-config.json');
  writeFileSync(
    configPath,
    JSON.stringify(DEFAULT_SYSTEM_CONFIG, null, 2),
    'utf-8',
  );
  const config = new ConfigManager({ configPath });
  return {
    dir,
    configPath,
    config,
  };
}

function makeContext(scaffold: ReturnType<typeof createScaffold>) {
  return {
    dataDir: scaffold.dir,
    config: scaffold.config,
  } as unknown as Parameters<typeof firstRunRouter.createCaller>[0];
}

beforeEach(() => {
  testDirs = [];
});

afterEach(() => {
  for (const dir of testDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe('firstRun.writeIdentity (SP 1.3 — Decisions 3 + 7)', () => {
  // T1 (C26)
  it('happy path: writers persist values; getWelcomeMessageSent unchanged', async () => {
    const scaffold = createScaffold();
    const caller = firstRunRouter.createCaller(makeContext(scaffold));

    const result = await caller.writeIdentity({
      name: 'Nia',
      personality: { preset: 'professional' },
      profile: {
        displayName: 'Andrew',
        expertise: 'advanced',
      },
    });

    expect(result.success).toBe(true);

    expect(scaffold.config.getAgentName()).toBe('Nia');
    expect(scaffold.config.getPersonalityConfig()).toEqual({
      preset: 'professional',
    });
    expect(scaffold.config.getUserProfile()).toEqual({
      displayName: 'Andrew',
      expertise: 'advanced',
    });
    // welcomeMessageSent reader should still return its default — writeIdentity
    // only writes name/personality/profile per SDS § 3.5.
    expect(scaffold.config.getWelcomeMessageSent()).toBe(false);
  });

  // T2 (C27)
  it('input payload is JSON-serializable end-to-end', async () => {
    const scaffold = createScaffold();
    const caller = firstRunRouter.createCaller(makeContext(scaffold));

    const input = {
      name: 'Nia',
      personality: { preset: 'balanced' as const },
      profile: { displayName: 'Andrew' },
    };
    // Round-trip through JSON to prove no Date/Map/Set/function values would
    // survive — the wizard's `trpc-fetch.ts` uses raw fetch (no SuperJSON)
    // so the procedure must accept what JSON.parse(JSON.stringify(input))
    // produces.
    const roundTripped = JSON.parse(JSON.stringify(input));
    const result = await caller.writeIdentity(roundTripped);
    expect(result.success).toBe(true);
  });

  it('rejects invalid input shape (Zod failure at procedure boundary)', async () => {
    const scaffold = createScaffold();
    const caller = firstRunRouter.createCaller(makeContext(scaffold));

    // tRPC throws when input fails Zod parsing. We assert the procedure
    // rejects rather than silently accepting an invalid preset.
    await expect(
      caller.writeIdentity({
        name: 'Nia',
        personality: { preset: 'invalid' as 'balanced' },
        profile: {},
      }),
    ).rejects.toThrow();
  });

  // T3 (C28)
  it("marks 'agent_identity' complete on successful write", async () => {
    const scaffold = createScaffold();
    const caller = firstRunRouter.createCaller(makeContext(scaffold));

    await caller.writeIdentity({
      name: 'Nia',
      personality: { preset: 'balanced' },
      profile: {},
    });

    const state = await getFirstRunState(scaffold.dir);
    expect(state.steps.agent_identity.status).toBe('complete');
    expect(typeof state.steps.agent_identity.completedAt).toBe('string');
  });

  // T4 (F1) — partial-write resilience
  it('F1 partial-write: invalid name fails before writers run; disk unchanged', async () => {
    const scaffold = createScaffold();
    const caller = firstRunRouter.createCaller(makeContext(scaffold));

    const beforeContent = readFileSync(scaffold.configPath, 'utf-8');

    // Empty name fails Zod input validation at the procedure boundary
    // (PersonalityConfigSchema requires preset; WriteIdentityInputSchema
    // requires name.min(1)). The procedure rejects before any writer runs.
    await expect(
      caller.writeIdentity({
        name: '',
        personality: { preset: 'balanced' },
        profile: {},
      }),
    ).rejects.toThrow();

    expect(readFileSync(scaffold.configPath, 'utf-8')).toBe(beforeContent);
    // No agent_identity step state file should be written.
    const stateFile = join(scaffold.dir, '.nous-first-run-state.json');
    if (existsSync(stateFile)) {
      const state = await getFirstRunState(scaffold.dir);
      expect(state.steps.agent_identity.status).toBe('pending');
    }
  });
});
