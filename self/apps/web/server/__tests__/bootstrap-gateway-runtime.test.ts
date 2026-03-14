import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ProviderRegistry } from '@nous/subcortex-providers';
import { clearNousContextCache, createNousContext } from '../bootstrap';

describe('bootstrap gateway runtime', () => {
  const originalDataDir = process.env.NOUS_DATA_DIR;
  let capturedLaneRegistry: ProviderRegistry['laneRegistry'] | null = null;
  let capturedProviderId: ReturnType<ProviderRegistry['listProviders']>[number]['id'] | null =
    null;

  beforeEach(() => {
    capturedLaneRegistry = null;
    capturedProviderId = null;
    vi.spyOn(ProviderRegistry.prototype, 'onLeaseReleased').mockImplementation(
      function (this: ProviderRegistry, listener) {
        capturedLaneRegistry = this.laneRegistry;
        capturedProviderId = this.listProviders()[0]?.id ?? null;
        return this.laneRegistry.onLeaseReleased(listener);
      },
    );
  });

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.NOUS_DATA_DIR;
    } else {
      process.env.NOUS_DATA_DIR = originalDataDir;
    }
    vi.restoreAllMocks();
    clearNousContextCache();
  });

  it('boots the Principal/System runtime alongside the gateway-backed turn executor', () => {
    const dataDir = join(tmpdir(), `nous-web-gateway-runtime-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });

    process.env.NOUS_DATA_DIR = dataDir;
    delete process.env.NOUS_CONFIG_PATH;
    clearNousContextCache();

    const ctx = createNousContext();

    expect(ctx.coreExecutor).toBeDefined();
    expect(ctx.gatewayRuntime).toBeDefined();
    expect(ctx.publicMcpGatewayService).toBeDefined();
    expect(ctx.publicMcpExecutionBridge).toBeDefined();
    expect(ctx.gatewayRuntime.getBootSnapshot().status).toBe('ready');
    expect(ctx.gatewayRuntime.getSystemContextReplica().inboxReady).toBe(true);
  });

  it('wires provider lane lease releases back into the gateway runtime', async () => {
    const dataDir = join(tmpdir(), `nous-web-gateway-runtime-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });

    process.env.NOUS_DATA_DIR = dataDir;
    delete process.env.NOUS_CONFIG_PATH;
    clearNousContextCache();

    const ctx = createNousContext();
    const notifyLeaseReleased = vi.spyOn(ctx.gatewayRuntime, 'notifyLeaseReleased');

    expect(capturedLaneRegistry).toBeDefined();
    expect(capturedProviderId).toBeDefined();

    const provider = ctx.getProvider(capturedProviderId!);
    expect(provider).toBeDefined();

    const lane = capturedLaneRegistry!.getOrCreate(provider!.getConfig());
    const leaseId = lane.acquireLease({ holderType: 'voice_call' });
    lane.releaseLease(leaseId);

    await vi.waitFor(() => {
      expect(notifyLeaseReleased).toHaveBeenCalledWith({
        laneKey: lane.laneKey,
        leaseId,
      });
    });
  });
});
