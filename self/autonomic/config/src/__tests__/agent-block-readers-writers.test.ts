/**
 * Reader/writer behaviour tests for the SP 1.3 `agent` block
 * (Goals C6-C16; SDS § 6.1 Blocks A-G).
 *
 * Uses a real ConfigManager with a temp-file configPath (vitest tmpdir
 * pattern, per Goals R8 / SDS § 6.1). Each test starts with a fresh temp
 * file containing a baseline `nous-config.json5` (no `agent` block) — this
 * exercises the actual on-disk path so we distinguish "block absent" from
 * "block present with default-valued fields".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigError } from '@nous/shared';
import { ConfigManager } from '../config-manager.js';
import { DEFAULT_SYSTEM_CONFIG } from '../defaults.js';
import type {
  PersonalityConfig,
  TraitAxesOverrides,
  UserProfile,
} from '../schema.js';

const TEST_DIR = join(
  tmpdir(),
  'nous-agent-block-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
);

function writeBaselineConfig(path: string, extra: Record<string, unknown> = {}): void {
  const config = { ...DEFAULT_SYSTEM_CONFIG, ...extra };
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
}

function freshConfig(name = 'config.json'): { path: string; manager: ConfigManager } {
  const path = join(TEST_DIR, name);
  writeBaselineConfig(path);
  const manager = new ConfigManager({ configPath: path });
  return { path, manager };
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── Block A — Reader defaults (C6-C9) ──────────────────────────────────

describe('SP 1.3 Block A — Reader defaults (C6-C9)', () => {
  it('A1 — getAgentName() returns "Nous" when agent block absent', () => {
    const { manager } = freshConfig();
    expect(manager.getAgentName()).toBe('Nous');
  });

  it('A2 — getPersonalityConfig() returns { preset: "balanced" } when absent', () => {
    const { manager } = freshConfig();
    const config = manager.getPersonalityConfig();
    expect(config).toEqual({ preset: 'balanced' });
    // Frozen-sentinel reference stability: every call returns the same
    // (frozen) reference. This is module-level — a separate call from a
    // separate manager instance still returns the same sentinel.
    expect(manager.getPersonalityConfig()).toBe(config);
  });

  it('A3 — getUserProfile() returns {} when agent block absent', () => {
    const { manager } = freshConfig();
    expect(manager.getUserProfile()).toEqual({});
  });

  it('A4 — getWelcomeMessageSent() returns false when absent', () => {
    const { manager } = freshConfig();
    expect(manager.getWelcomeMessageSent()).toBe(false);
  });
});

// ── Block B — Reader purity (C10) ──────────────────────────────────────

describe('SP 1.3 Block B — Reader purity (C10)', () => {
  it('B1 — readers do not write to disk', async () => {
    const { path, manager } = freshConfig();
    const beforeMtime = statSync(path).mtimeMs;
    const beforeContent = readFileSync(path, 'utf-8');

    // Sequential reads — should NOT touch disk.
    manager.getAgentName();
    manager.getPersonalityConfig();
    manager.getUserProfile();
    manager.getWelcomeMessageSent();

    // Wait a tick so any spurious mtime change would surface.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const afterMtime = statSync(path).mtimeMs;
    const afterContent = readFileSync(path, 'utf-8');

    expect(afterMtime).toBe(beforeMtime);
    expect(afterContent).toBe(beforeContent);
    // The file must NOT have gained an `agent` key.
    const parsed = JSON.parse(afterContent) as { agent?: unknown };
    expect(parsed.agent).toBeUndefined();
  });
});

// ── Block C — Reader values when block is present ──────────────────────

describe('SP 1.3 Block C — Reader values when block is present', () => {
  it('C1 — partial block { name: "Nia" }: name set, others default', () => {
    const path = join(TEST_DIR, 'partial-name.json');
    writeBaselineConfig(path, { agent: { name: 'Nia' } });
    const manager = new ConfigManager({ configPath: path });

    expect(manager.getAgentName()).toBe('Nia');
    expect(manager.getPersonalityConfig()).toEqual({ preset: 'balanced' });
    expect(manager.getUserProfile()).toEqual({});
    expect(manager.getWelcomeMessageSent()).toBe(false);
  });

  it('C2 — partial block { personality: { preset: "professional" } }: only personality set', () => {
    const path = join(TEST_DIR, 'partial-personality.json');
    writeBaselineConfig(path, {
      agent: { personality: { preset: 'professional' } },
    });
    const manager = new ConfigManager({ configPath: path });

    expect(manager.getAgentName()).toBe('Nous');
    expect(manager.getPersonalityConfig()).toEqual({ preset: 'professional' });
    expect(manager.getUserProfile()).toEqual({});
    expect(manager.getWelcomeMessageSent()).toBe(false);
  });

  it('C3 — full block: all readers return persisted values', () => {
    const path = join(TEST_DIR, 'full.json');
    writeBaselineConfig(path, {
      agent: {
        name: 'Nia',
        personality: { preset: 'thorough' },
        welcomeMessageSent: true,
        profile: {
          displayName: 'Andrew',
          role: 'Engineer',
          expertise: 'advanced',
        },
      },
    });
    const manager = new ConfigManager({ configPath: path });

    expect(manager.getAgentName()).toBe('Nia');
    expect(manager.getPersonalityConfig()).toEqual({ preset: 'thorough' });
    expect(manager.getUserProfile()).toEqual({
      displayName: 'Andrew',
      role: 'Engineer',
      expertise: 'advanced',
    });
    expect(manager.getWelcomeMessageSent()).toBe(true);
  });
});

// ── Block D — Writer creates block on first write (C11) ────────────────

describe('SP 1.3 Block D — Writer creates block on first write (C11)', () => {
  it('D1 — setAgentName creates agent block on first write', async () => {
    const { path, manager } = freshConfig();
    await manager.setAgentName('Nia');

    expect(manager.getAgentName()).toBe('Nia');
    const onDisk = JSON.parse(readFileSync(path, 'utf-8')) as {
      agent?: { name?: string };
    };
    expect(onDisk.agent).toEqual({ name: 'Nia' });
  });

  it('D2 — setPersonalityConfig creates agent block on first write', async () => {
    const { path, manager } = freshConfig();
    const next: PersonalityConfig = { preset: 'thorough' };
    await manager.setPersonalityConfig(next);

    expect(manager.getPersonalityConfig()).toEqual(next);
    const onDisk = JSON.parse(readFileSync(path, 'utf-8')) as {
      agent?: { personality?: PersonalityConfig };
    };
    expect(onDisk.agent).toEqual({ personality: { preset: 'thorough' } });
  });

  it('D3 — setUserProfile and setWelcomeMessageSent create block on first write', async () => {
    const a = freshConfig('a.json');
    await a.manager.setUserProfile({ displayName: 'Andrew' });
    expect(a.manager.getUserProfile()).toEqual({ displayName: 'Andrew' });
    const aOnDisk = JSON.parse(readFileSync(a.path, 'utf-8')) as {
      agent?: { profile?: UserProfile };
    };
    expect(aOnDisk.agent).toEqual({ profile: { displayName: 'Andrew' } });

    const b = freshConfig('b.json');
    await b.manager.setWelcomeMessageSent(true);
    expect(b.manager.getWelcomeMessageSent()).toBe(true);
    const bOnDisk = JSON.parse(readFileSync(b.path, 'utf-8')) as {
      agent?: { welcomeMessageSent?: boolean };
    };
    expect(bOnDisk.agent).toEqual({ welcomeMessageSent: true });
  });
});

// ── Block E — Sibling preservation (C12, C13, C14) ─────────────────────

describe('SP 1.3 Block E — Sibling preservation (C12-C14)', () => {
  it('E1 — setAgentName then setPersonalityConfig preserves name', async () => {
    const { manager } = freshConfig();
    await manager.setAgentName('Nia');
    await manager.setPersonalityConfig({ preset: 'efficient' });

    expect(manager.getAgentName()).toBe('Nia'); // preserved
    expect(manager.getPersonalityConfig()).toEqual({ preset: 'efficient' });
  });

  it('E2 — all four writers in sequence: every reader returns its set value', async () => {
    const { manager } = freshConfig();
    await manager.setAgentName('Nia');
    await manager.setPersonalityConfig({ preset: 'professional' });
    await manager.setUserProfile({ displayName: 'Andrew', expertise: 'advanced' });
    await manager.setWelcomeMessageSent(true);

    expect(manager.getAgentName()).toBe('Nia');
    expect(manager.getPersonalityConfig()).toEqual({ preset: 'professional' });
    expect(manager.getUserProfile()).toEqual({
      displayName: 'Andrew',
      expertise: 'advanced',
    });
    expect(manager.getWelcomeMessageSent()).toBe(true);
  });

  it('E3 — overwriting one field leaves the other three intact', async () => {
    const { manager } = freshConfig();
    await manager.setAgentName('Nia');
    await manager.setPersonalityConfig({ preset: 'professional' });
    await manager.setUserProfile({ displayName: 'Andrew' });
    await manager.setWelcomeMessageSent(true);

    // Overwrite name only.
    await manager.setAgentName('Other');
    expect(manager.getAgentName()).toBe('Other');
    expect(manager.getPersonalityConfig()).toEqual({ preset: 'professional' });
    expect(manager.getUserProfile()).toEqual({ displayName: 'Andrew' });
    expect(manager.getWelcomeMessageSent()).toBe(true);
  });
});

// ── Block F — clearAgentBlock (C15) ────────────────────────────────────

describe('SP 1.3 Block F — clearAgentBlock (C15)', () => {
  it('F1 — clearAgentBlock removes the entire agent block; readers return defaults', async () => {
    const path = join(TEST_DIR, 'clear-full.json');
    writeBaselineConfig(path, {
      agent: {
        name: 'Nia',
        personality: { preset: 'thorough' },
        welcomeMessageSent: true,
        profile: { displayName: 'Andrew' },
      },
    });
    const manager = new ConfigManager({ configPath: path });

    await manager.clearAgentBlock();

    expect(manager.getAgentName()).toBe('Nous');
    expect(manager.getPersonalityConfig()).toEqual({ preset: 'balanced' });
    expect(manager.getUserProfile()).toEqual({});
    expect(manager.getWelcomeMessageSent()).toBe(false);

    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    expect('agent' in parsed).toBe(false);
  });

  it('F2 — clearAgentBlock is a no-op when block already absent', async () => {
    const { path, manager } = freshConfig();
    const beforeMtime = statSync(path).mtimeMs;
    const beforeContent = readFileSync(path, 'utf-8');

    await manager.clearAgentBlock();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const afterMtime = statSync(path).mtimeMs;
    const afterContent = readFileSync(path, 'utf-8');

    expect(afterMtime).toBe(beforeMtime);
    expect(afterContent).toBe(beforeContent);
  });

  it('F3 — clearAgentBlock preserves all other top-level keys bit-for-bit', async () => {
    const path = join(TEST_DIR, 'clear-with-providers.json');
    writeBaselineConfig(path, {
      agent: { name: 'Nia' },
      providers: [
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          name: 'Test Provider',
          type: 'text',
          modelId: 'test-model',
          isLocal: false,
          capabilities: ['chat'],
        },
      ],
    });
    const manager = new ConfigManager({ configPath: path });

    const beforeContent = readFileSync(path, 'utf-8');
    const beforeParsed = JSON.parse(beforeContent) as Record<string, unknown>;
    const beforeWithoutAgent = { ...beforeParsed };
    delete beforeWithoutAgent.agent;

    await manager.clearAgentBlock();

    const afterParsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    expect('agent' in afterParsed).toBe(false);
    expect(JSON.stringify(afterParsed)).toBe(JSON.stringify(beforeWithoutAgent));
  });
});

// ── Block G — Writer Zod validation (C16) ──────────────────────────────

describe('SP 1.3 Block G — Writer Zod validation (C16)', () => {
  it('G1 — setAgentName("") throws ConfigError; on-disk unchanged', async () => {
    const { path, manager } = freshConfig();
    const beforeContent = readFileSync(path, 'utf-8');

    await expect(manager.setAgentName('')).rejects.toThrow(ConfigError);

    expect(readFileSync(path, 'utf-8')).toBe(beforeContent);
    expect(manager.getAgentName()).toBe('Nous'); // still default
  });

  it('G2 — setPersonalityConfig with invalid preset throws; on-disk unchanged', async () => {
    const { path, manager } = freshConfig();
    const beforeContent = readFileSync(path, 'utf-8');

    await expect(
      manager.setPersonalityConfig({ preset: 'invalid' as PersonalityConfig['preset'] }),
    ).rejects.toThrow(ConfigError);

    expect(readFileSync(path, 'utf-8')).toBe(beforeContent);
  });

  it('G3 — setPersonalityConfig with unknown override key throws (.strict)', async () => {
    const { path, manager } = freshConfig();
    const beforeContent = readFileSync(path, 'utf-8');

    await expect(
      manager.setPersonalityConfig({
        preset: 'balanced',
        overrides: { typo: 'value' } as unknown as TraitAxesOverrides,
      }),
    ).rejects.toThrow(ConfigError);

    expect(readFileSync(path, 'utf-8')).toBe(beforeContent);
  });

  it('G4 — setUserProfile with invalid expertise enum throws; on-disk unchanged', async () => {
    const { path, manager } = freshConfig();
    const beforeContent = readFileSync(path, 'utf-8');

    await expect(
      manager.setUserProfile({
        expertise: 'expert' as UserProfile['expertise'],
      }),
    ).rejects.toThrow(ConfigError);

    expect(readFileSync(path, 'utf-8')).toBe(beforeContent);
  });
});
