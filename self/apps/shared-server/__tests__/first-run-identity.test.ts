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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// SP 1.9 Tasks #8 + #9 — make a richer context that carries the
// `getProvider` + `gatewayRuntime` surfaces consumed by
// `resolvePrincipalVendor` + `recomposeHarnessForClass`. Used by Task #17
// cases R1 / R2 / R3.
function makeRecomposeContext(
  scaffold: ReturnType<typeof createScaffold>,
  opts: {
    vendor?: string;
    getProviderThrows?: boolean;
    providerNull?: boolean;
  } = {},
) {
  const recomposeSpy = vi.fn();
  const getProviderSpy = vi.fn(() => {
    if (opts.getProviderThrows) {
      throw new Error('provider lookup failed');
    }
    if (opts.providerNull) return null;
    return {
      getConfig: () => ({ vendor: opts.vendor ?? 'ollama' }),
    };
  });
  return {
    ctx: {
      dataDir: scaffold.dir,
      config: scaffold.config,
      getProvider: getProviderSpy,
      gatewayRuntime: { recomposeHarnessForClass: recomposeSpy },
    } as unknown as Parameters<typeof firstRunRouter.createCaller>[0],
    recomposeSpy,
    getProviderSpy,
  };
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

  // SP 1.9 Task #17 — Axis A-adjacent recompose-trigger coverage
  // (Goals C4 / C5 / Plan Q-SDS-Vendor-1).

  // R1 — writeIdentity triggers recompose with the resolved vendor.
  it('R1 (SP 1.9): writeIdentity triggers recomposeHarnessForClass after setUserProfile', async () => {
    const scaffold = createScaffold();
    const { ctx, recomposeSpy, getProviderSpy } = makeRecomposeContext(scaffold, {
      vendor: 'ollama',
    });
    const caller = firstRunRouter.createCaller(ctx);

    await caller.writeIdentity({
      name: 'Atlas',
      personality: { preset: 'balanced' },
      profile: {},
    });

    expect(getProviderSpy).toHaveBeenCalledTimes(1);
    expect(recomposeSpy).toHaveBeenCalledTimes(1);
    expect(recomposeSpy).toHaveBeenCalledWith('Cortex::Principal', 'ollama');
  });

  // R3 — graceful-degradation: ctx.getProvider throws → resolver returns
  // 'text' → recompose still called with 'text' (SDS § 0 Note 10).
  it('R3 (SP 1.9): writeIdentity recompose graceful-degrades to "text" on getProvider error', async () => {
    const scaffold = createScaffold();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx, recomposeSpy } = makeRecomposeContext(scaffold, {
      getProviderThrows: true,
    });
    const caller = firstRunRouter.createCaller(ctx);

    await caller.writeIdentity({
      name: 'Atlas',
      personality: { preset: 'balanced' },
      profile: {},
    });

    expect(recomposeSpy).toHaveBeenCalledTimes(1);
    expect(recomposeSpy).toHaveBeenCalledWith('Cortex::Principal', 'text');
    // resolvePrincipalVendor's inner catch logs a warn line.
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // R3b — provider returns null (not registered yet) → 'text' fallback.
  it('R3b (SP 1.9): writeIdentity recompose graceful-degrades to "text" when provider is not registered', async () => {
    const scaffold = createScaffold();
    const { ctx, recomposeSpy } = makeRecomposeContext(scaffold, {
      providerNull: true,
    });
    const caller = firstRunRouter.createCaller(ctx);

    await caller.writeIdentity({
      name: 'Atlas',
      personality: { preset: 'balanced' },
      profile: {},
    });

    expect(recomposeSpy).toHaveBeenCalledTimes(1);
    expect(recomposeSpy).toHaveBeenCalledWith('Cortex::Principal', 'text');
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
