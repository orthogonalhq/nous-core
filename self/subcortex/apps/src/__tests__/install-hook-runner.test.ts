import { describe, expect, it } from 'vitest';
import { InstallHookRunner } from '../install-hook-runner.js';

describe('InstallHookRunner', () => {
  it('normalizes legacy validation output into the canonical results array', async () => {
    const runner = new InstallHookRunner({
      execute: async () => ({
        stdout: JSON.stringify({
          status: 'partial',
          validation: [
            {
              check: 'full-client-credentials-complete',
              passed: false,
              retryable: true,
            },
          ],
          mode: 'connector',
        }),
        stderr: '',
      }),
    });

    const result = await runner.runOnInstall({
      hook_ref: '/tmp/install.ts',
      payload: {
        app_id: 'telegram',
        package_id: 'telegram-connector',
        config: {},
        secret_config: {},
      },
    });

    expect(result.status).toBe('partial');
    expect(result.results).toEqual([
      expect.objectContaining({
        check: 'full-client-credentials-complete',
        passed: false,
      }),
    ]);
    expect(result.metadata.mode).toBe('connector');
  });

  it('returns a success result when no install hook is declared', async () => {
    const runner = new InstallHookRunner();

    const result = await runner.runOnInstall({
      payload: {
        app_id: 'weather',
        package_id: 'weather-app',
        config: {},
        secret_config: {},
      },
    });

    expect(result).toEqual({
      status: 'success',
      results: [],
      metadata: {},
    });
  });
});

