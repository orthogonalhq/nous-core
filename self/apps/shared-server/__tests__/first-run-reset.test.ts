// First-run resetWizard tRPC procedure tests
// (Goals C17-C19; SDS § 6.3 / § 0 Note 1 Option B).
//
// Per implementation plan task 32. The vitest config picks up tests under
// the `__tests__/...test.ts` glob; the file lives at
// `self/apps/shared-server/__tests__/first-run-reset.test.ts` for
// compatibility (deviation from the plan's `src/__tests__/trpc/...` path
// documented in the Completion Report).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigManager, DEFAULT_SYSTEM_CONFIG } from '@nous/autonomic-config';
import { firstRunRouter } from '../src/trpc/routers/first-run';

let testDirs: string[] = [];

const SAMPLE_PROVIDER = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Test Provider',
  type: 'text' as const,
  modelId: 'test-model',
  isLocal: false,
  capabilities: ['chat'],
};

const SAMPLE_ROLE_ASSIGNMENT = {
  role: 'cortex-chat' as const,
  providerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
};

function createScaffoldWithProviders() {
  const dir = join(
    tmpdir(),
    'nous-fr-reset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
  );
  mkdirSync(dir, { recursive: true });
  testDirs.push(dir);

  const configPath = join(dir, 'nous-config.json');
  const initialConfig = {
    ...DEFAULT_SYSTEM_CONFIG,
    providers: [SAMPLE_PROVIDER],
    modelRoleAssignments: [SAMPLE_ROLE_ASSIGNMENT],
    agent: {
      name: 'Nia',
      personality: { preset: 'professional' as const },
      welcomeMessageSent: true,
      profile: {
        displayName: 'Andrew',
        expertise: 'advanced' as const,
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(initialConfig, null, 2), 'utf-8');
  const config = new ConfigManager({ configPath });

  return { dir, configPath, config };
}

function makeContext(scaffold: ReturnType<typeof createScaffoldWithProviders>) {
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

describe('firstRun.resetWizard (SP 1.3 — Decision 7 Option B)', () => {
  // C17
  it('clears the entire `agent` block; readers return defaults; wizard state is default', async () => {
    const scaffold = createScaffoldWithProviders();
    const caller = firstRunRouter.createCaller(makeContext(scaffold));

    // Pre-state: full agent block present
    expect(scaffold.config.getAgentName()).toBe('Nia');
    expect(scaffold.config.getPersonalityConfig()).toEqual({
      preset: 'professional',
    });

    const newState = await caller.resetWizard();

    // Wizard state is default
    expect(newState.complete).toBe(false);
    expect(newState.currentStep).toBe('ollama_check');

    // All four agent readers return defaults (block cleared)
    expect(scaffold.config.getAgentName()).toBe('Nous');
    expect(scaffold.config.getPersonalityConfig()).toEqual({
      preset: 'balanced',
    });
    expect(scaffold.config.getUserProfile()).toEqual({});
    expect(scaffold.config.getWelcomeMessageSent()).toBe(false);
  });

  // C18
  it('does not modify providers or modelRoleAssignments (sibling preservation)', async () => {
    const scaffold = createScaffoldWithProviders();
    const caller = firstRunRouter.createCaller(makeContext(scaffold));

    const beforeRaw = JSON.parse(readFileSync(scaffold.configPath, 'utf-8')) as {
      providers: unknown[];
      modelRoleAssignments: unknown[];
    };
    const providersBefore = JSON.stringify(beforeRaw.providers);
    const roleAssignmentsBefore = JSON.stringify(beforeRaw.modelRoleAssignments);

    await caller.resetWizard();

    const afterRaw = JSON.parse(readFileSync(scaffold.configPath, 'utf-8')) as {
      providers: unknown[];
      modelRoleAssignments: unknown[];
      agent?: unknown;
    };

    expect(JSON.stringify(afterRaw.providers)).toBe(providersBefore);
    expect(JSON.stringify(afterRaw.modelRoleAssignments)).toBe(
      roleAssignmentsBefore,
    );
    // `agent` key is gone entirely.
    expect('agent' in afterRaw).toBe(false);
  });

  // C19 — three sub-assertions
  it('reset clears block, post-reset readers return defaults, then writeIdentity re-populates', async () => {
    const scaffold = createScaffoldWithProviders();
    const caller = firstRunRouter.createCaller(makeContext(scaffold));

    // (a) reset clears the block
    await caller.resetWizard();
    const cleared = JSON.parse(readFileSync(scaffold.configPath, 'utf-8'));
    expect('agent' in cleared).toBe(false);

    // (b) post-reset readers return defaults
    expect(scaffold.config.getAgentName()).toBe('Nous');
    expect(scaffold.config.getPersonalityConfig()).toEqual({
      preset: 'balanced',
    });
    expect(scaffold.config.getUserProfile()).toEqual({});
    expect(scaffold.config.getWelcomeMessageSent()).toBe(false);

    // (c) running a fresh writeIdentity re-populates the block
    const result = await caller.writeIdentity({
      name: 'Sigma',
      personality: { preset: 'efficient' },
      profile: { displayName: 'Test User' },
    });
    expect(result.success).toBe(true);
    expect(scaffold.config.getAgentName()).toBe('Sigma');
    expect(scaffold.config.getPersonalityConfig()).toEqual({
      preset: 'efficient',
    });
    expect(scaffold.config.getUserProfile()).toEqual({
      displayName: 'Test User',
    });
  });
});
