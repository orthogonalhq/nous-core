/**
 * SP 1.6 — Welcome coordinator Tier-1 contract tests (T1-T10).
 *
 * Each test mocks `gatewayRuntime`, `configManager` (Pick subset), `stmStore`,
 * and `log`; asserts call counts, arguments, and the discriminated return.
 * The set-after-successful-emission ordering (SDS § 0 Note 3) is exercised
 * by T1, T3, T4, T5 (writer NOT called on any failure path).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireWelcomeIfUnsent,
  WELCOME_SEED_FRAGMENT,
  type WelcomeCoordinatorDeps,
} from '../src/welcome/index.js';

const FIXED_TIMESTAMP = '2026-04-18T12:00:00.000Z';
const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

interface DepsOverrides {
  welcomeMessageSent?: boolean;
  composerResponse?: { response: string; traceId: string; contentType?: 'text' | 'openui' };
  composerThrow?: Error;
  stmAppendThrow?: Error;
  personalityConfig?: { preset: 'balanced' | 'professional' | 'casual' | 'efficient' | 'inquisitive' };
}

function createDeps(overrides: DepsOverrides = {}) {
  const handleChatTurn = vi.fn();
  if (overrides.composerThrow) {
    handleChatTurn.mockRejectedValue(overrides.composerThrow);
  } else {
    handleChatTurn.mockResolvedValue(
      overrides.composerResponse ?? {
        response: 'Hello — happy to help.',
        traceId: 'trace-stub',
        contentType: 'text',
      },
    );
  }

  const append = vi.fn();
  if (overrides.stmAppendThrow) {
    append.mockRejectedValue(overrides.stmAppendThrow);
  } else {
    append.mockResolvedValue(undefined);
  }

  const personality = overrides.personalityConfig ?? { preset: 'balanced' as const };
  const getPersonalityConfig = vi.fn(() => structuredClone(personality));
  const getWelcomeMessageSent = vi.fn(() => Boolean(overrides.welcomeMessageSent));
  const setWelcomeMessageSent = vi.fn().mockResolvedValue(undefined);

  const log = { warn: vi.fn(), info: vi.fn() };

  const deps = {
    gatewayRuntime: { handleChatTurn } as unknown as WelcomeCoordinatorDeps['gatewayRuntime'],
    configManager: {
      getWelcomeMessageSent,
      setWelcomeMessageSent,
      getPersonalityConfig,
    },
    stmStore: { append } as unknown as WelcomeCoordinatorDeps['stmStore'],
    log,
    now: () => FIXED_TIMESTAMP,
  } satisfies WelcomeCoordinatorDeps;

  return { deps, handleChatTurn, append, getWelcomeMessageSent, setWelcomeMessageSent, getPersonalityConfig, log };
}

describe('fireWelcomeIfUnsent — coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T1 — Happy path: composer returns response, STM appends, flag set.
  it('T1 flag-false happy path: composes, appends assistant entry, sets flag, returns success', async () => {
    const { deps, handleChatTurn, append, getWelcomeMessageSent, setWelcomeMessageSent } = createDeps();

    const result = await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    expect(getWelcomeMessageSent).toHaveBeenCalledTimes(1);
    expect(handleChatTurn).toHaveBeenCalledTimes(1);
    expect(handleChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: WELCOME_SEED_FRAGMENT,
        projectId: undefined,
      }),
    );
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello — happy to help.',
        timestamp: FIXED_TIMESTAMP,
      }),
    );
    expect(setWelcomeMessageSent).toHaveBeenCalledTimes(1);
    expect(setWelcomeMessageSent).toHaveBeenCalledWith(true);
    expect(result.welcomeFired).toBe(true);
    if (result.welcomeFired) {
      expect(typeof result.traceId).toBe('string');
      expect(result.traceId.length).toBeGreaterThan(0);
    }
  });

  // T2 — Flag-true short-circuit.
  it('T2 flag-true short-circuit: skips composer, STM, and writer; returns already_sent', async () => {
    const { deps, handleChatTurn, append, setWelcomeMessageSent } = createDeps({
      welcomeMessageSent: true,
    });

    const result = await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    expect(handleChatTurn).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(setWelcomeMessageSent).not.toHaveBeenCalled();
    expect(result).toEqual({ welcomeFired: false, reason: 'already_sent' });
  });

  // T3 — Composer throws → graceful degradation.
  it('T3 composer throws: returns composition_error; STM and flag untouched', async () => {
    const { deps, append, setWelcomeMessageSent, log } = createDeps({
      composerThrow: new Error('provider unreachable'),
    });

    const result = await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    expect(append).not.toHaveBeenCalled();
    expect(setWelcomeMessageSent).not.toHaveBeenCalled();
    expect(result).toEqual({ welcomeFired: false, reason: 'composition_error' });
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('composition failed'),
      expect.objectContaining({ error: expect.stringContaining('provider unreachable') }),
    );
  });

  // T4 — Composer returns empty response (and whitespace-only).
  it('T4 composer returns empty response: returns empty_response; flag untouched', async () => {
    const { deps, append, setWelcomeMessageSent } = createDeps({
      composerResponse: { response: '', traceId: 'trace-stub', contentType: 'text' },
    });

    const result = await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    expect(append).not.toHaveBeenCalled();
    expect(setWelcomeMessageSent).not.toHaveBeenCalled();
    expect(result).toEqual({ welcomeFired: false, reason: 'empty_response' });
  });

  it('T4b composer returns whitespace-only response: same empty_response handling', async () => {
    const { deps, append, setWelcomeMessageSent } = createDeps({
      composerResponse: { response: '   \n\t  ', traceId: 'trace-stub', contentType: 'text' },
    });

    const result = await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    expect(append).not.toHaveBeenCalled();
    expect(setWelcomeMessageSent).not.toHaveBeenCalled();
    expect(result).toEqual({ welcomeFired: false, reason: 'empty_response' });
  });

  // T5 — STM append throws.
  it('T5 STM append throws: returns stm_append_error; flag untouched', async () => {
    const { deps, setWelcomeMessageSent, log } = createDeps({
      stmAppendThrow: new Error('disk full'),
    });

    const result = await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    expect(setWelcomeMessageSent).not.toHaveBeenCalled();
    expect(result).toEqual({ welcomeFired: false, reason: 'stm_append_error' });
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('STM append failed'),
      expect.objectContaining({ error: expect.stringContaining('disk full') }),
    );
  });

  // T6 — No projectId guard.
  it('T6 no projectId: returns no_project_id without invoking composer or STM', async () => {
    const { deps, handleChatTurn, append, setWelcomeMessageSent } = createDeps();

    const result = await fireWelcomeIfUnsent(deps, { projectId: undefined });

    expect(handleChatTurn).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(setWelcomeMessageSent).not.toHaveBeenCalled();
    expect(result).toEqual({ welcomeFired: false, reason: 'no_project_id' });
  });

  // T7 — Seed fragment exact match (binding wording per SDS § 0 Note 2 / I11).
  it('T7 composer received the exact SDS-bound seed fragment string', async () => {
    const { deps, handleChatTurn } = createDeps();

    await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    const args = handleChatTurn.mock.calls[0]?.[0] as { message: string };
    expect(args.message).toBe(
      'This is your first interaction with the user. Greet them warmly and offer to help.',
    );
    // Also verify the constant export matches verbatim (single source of truth).
    expect(WELCOME_SEED_FRAGMENT).toBe(
      'This is your first interaction with the user. Greet them warmly and offer to help.',
    );
  });

  // T8 — Personality config not persisted (no parallel write surface).
  it('T8 personality config snapshot is identical pre and post welcome (no persistence)', async () => {
    const { deps, getPersonalityConfig } = createDeps({
      personalityConfig: { preset: 'professional' },
    });

    const before = getPersonalityConfig();
    await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });
    const after = getPersonalityConfig();

    expect(after).toEqual(before);
  });

  // T9 — STM entry shape: no special metadata, no welcome flag.
  it('T9 STM append entry has no `type: welcome` or `metadata.welcome`/`firstTurn` field', async () => {
    const { deps, append } = createDeps();

    await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    const entry = append.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(entry).toBeDefined();
    expect((entry as { type?: unknown }).type).toBeUndefined();
    const metadata = (entry as { metadata?: Record<string, unknown> }).metadata;
    if (metadata) {
      expect(metadata.welcome).toBeUndefined();
      expect(metadata.firstTurn).toBeUndefined();
    }
  });

  it('T9b STM entry includes metadata.contentType only when composer returned non-text', async () => {
    const { deps, append } = createDeps({
      composerResponse: { response: '<openui>...</openui>', traceId: 'trace-stub', contentType: 'openui' },
    });

    await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    const entry = append.mock.calls[0]?.[1] as { metadata?: { contentType?: string } };
    expect(entry.metadata?.contentType).toBe('openui');
  });

  // T10 — No `user`-role STM entry for the seed.
  it('T10 STM append is never called with role: user (seed must not surface as user entry)', async () => {
    const { deps, append } = createDeps();

    await fireWelcomeIfUnsent(deps, { projectId: PROJECT_ID });

    const userCalls = append.mock.calls.filter(
      ([, entry]) => (entry as { role?: string }).role === 'user',
    );
    expect(userCalls).toHaveLength(0);
  });
});
