import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { clearNousContextCache, createNousContext } from '../bootstrap';

describe('bootstrap gateway runtime', () => {
  const originalDataDir = process.env.NOUS_DATA_DIR;

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.NOUS_DATA_DIR;
    } else {
      process.env.NOUS_DATA_DIR = originalDataDir;
    }
    clearNousContextCache();
  });

  it('boots the Principal/System runtime alongside CoreExecutor', () => {
    const dataDir = join(tmpdir(), `nous-web-gateway-runtime-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });

    process.env.NOUS_DATA_DIR = dataDir;
    delete process.env.NOUS_CONFIG_PATH;
    clearNousContextCache();

    const ctx = createNousContext();

    expect(ctx.coreExecutor).toBeDefined();
    expect(ctx.gatewayRuntime).toBeDefined();
    expect(ctx.gatewayRuntime.getBootSnapshot().status).toBe('ready');
    expect(ctx.gatewayRuntime.getSystemContextReplica().inboxReady).toBe(true);
  });
});
