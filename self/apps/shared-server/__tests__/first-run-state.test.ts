import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'nous-first-run-'));
}

async function loadModule() {
  return import('../src/first-run');
}

describe('first-run state', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('returns the default wizard state when no state file exists', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const { getFirstRunState } = await loadModule();

    const state = await getFirstRunState(dir);

    expect(state.currentStep).toBe('ollama_check');
    expect(state.complete).toBe(false);
    expect(state.steps.ollama_check.status).toBe('pending');
    // SP 1.3 — `agent_identity` added to FIRST_RUN_STEP_VALUES per
    // SDS § 0 Note 2; the default state includes it as pending.
    expect(state.steps.agent_identity.status).toBe('pending');
    expect(state.steps.model_download.status).toBe('pending');
    expect(state.steps.provider_config.status).toBe('pending');
    expect(state.steps.role_assignment.status).toBe('pending');
  });

  it('falls back to the default state when the state file is corrupted', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    writeFileSync(join(dir, '.nous-first-run-state.json'), '{not valid json', 'utf-8');

    const { getFirstRunState } = await loadModule();
    const state = await getFirstRunState(dir);

    expect(state.currentStep).toBe('ollama_check');
    expect(state.complete).toBe(false);
  });

  it('advances to the next step when a wizard step is completed', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const {
      getFirstRunState,
      markStepComplete,
    } = await loadModule();

    await markStepComplete(dir, 'ollama_check');
    const state = await getFirstRunState(dir);

    expect(state.steps.ollama_check.status).toBe('complete');
    // SP 1.3 — `agent_identity` was inserted between ollama_check and
    // model_download in FIRST_RUN_STEP_VALUES (SDS § 0 Note 2 / § 1.4).
    expect(state.currentStep).toBe('agent_identity');
  });

  it('marks the entire wizard complete after the final step and writes the legacy flag', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const {
      getFirstRunState,
      markStepComplete,
    } = await loadModule();

    await markStepComplete(dir, 'ollama_check');
    await markStepComplete(dir, 'agent_identity');
    await markStepComplete(dir, 'model_download');
    await markStepComplete(dir, 'provider_config');
    await markStepComplete(dir, 'role_assignment');

    const state = await getFirstRunState(dir);

    expect(state.currentStep).toBe('complete');
    expect(state.complete).toBe(true);
    expect(typeof state.completedAt).toBe('string');
    expect(existsSync(join(dir, '.nous-first-run-complete'))).toBe(true);
  });

  it('markFirstRunComplete preserves backward compatibility with the legacy completion flag', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const {
      getFirstRunState,
      isFirstRunComplete,
      markFirstRunComplete,
    } = await loadModule();

    markFirstRunComplete(dir);

    const wizardState = await getFirstRunState(dir);
    const complete = await isFirstRunComplete(dir, {
      list: vi.fn().mockResolvedValue([]),
    } as any);

    expect(wizardState.complete).toBe(true);
    expect(wizardState.currentStep).toBe('complete');
    expect(complete).toBe(true);
    expect(existsSync(join(dir, '.nous-first-run-complete'))).toBe(true);
  });

  it('resetFirstRunState removes completion and returns to the initial step', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const {
      getFirstRunState,
      markFirstRunComplete,
      resetFirstRunState,
    } = await loadModule();

    markFirstRunComplete(dir);
    const resetState = await resetFirstRunState(dir);
    const state = await getFirstRunState(dir);

    expect(resetState.currentStep).toBe('ollama_check');
    expect(resetState.complete).toBe(false);
    expect(state.currentStep).toBe('ollama_check');
    expect(existsSync(join(dir, '.nous-first-run-complete'))).toBe(false);
  });

  it('treats existing projects as first-run complete even without the flag file', async () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const { isFirstRunComplete } = await loadModule();

    const complete = await isFirstRunComplete(dir, {
      list: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
    } as any);

    expect(complete).toBe(true);
  });
});
