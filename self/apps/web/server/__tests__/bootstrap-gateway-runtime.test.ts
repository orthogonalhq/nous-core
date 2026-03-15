import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { PublicMcpSubject } from '@nous/shared';
import { ProviderRegistry } from '@nous/subcortex-providers';
import { clearNousContextCache, createNousContext } from '../bootstrap';

describe('bootstrap gateway runtime', () => {
  const originalDataDir = process.env.NOUS_DATA_DIR;
  const originalHostedBindings = process.env.NOUS_PUBLIC_MCP_HOSTED_BINDINGS_JSON;
  const originalTunnelSessions = process.env.NOUS_PUBLIC_MCP_TUNNEL_SESSIONS_JSON;
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
    if (originalHostedBindings === undefined) {
      delete process.env.NOUS_PUBLIC_MCP_HOSTED_BINDINGS_JSON;
    } else {
      process.env.NOUS_PUBLIC_MCP_HOSTED_BINDINGS_JSON = originalHostedBindings;
    }
    if (originalTunnelSessions === undefined) {
      delete process.env.NOUS_PUBLIC_MCP_TUNNEL_SESSIONS_JSON;
    } else {
      process.env.NOUS_PUBLIC_MCP_TUNNEL_SESSIONS_JSON = originalTunnelSessions;
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
    expect(
      ctx.gatewayRuntime.listSystemTools().map((tool) => tool.name),
    ).toContain('promoted_memory_promote');
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

  it('boots deployment-aware public gateway bundles for hosted and tunnel routing', async () => {
    const dataDir = join(tmpdir(), `nous-web-gateway-runtime-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });

    process.env.NOUS_DATA_DIR = dataDir;
    process.env.NOUS_PUBLIC_MCP_HOSTED_BINDINGS_JSON = JSON.stringify([
      {
        bindingId: 'binding-1',
        tenantId: 'tenant-1',
        userHandle: 'andre',
        host: 'andre.nous.run',
        storePrefix: 'tenant-andre',
        serverName: 'Andre Hosted Nous',
        phase: 'phase-13.5',
        status: 'active',
        createdAt: '2026-03-14T00:00:00.000Z',
        updatedAt: '2026-03-14T00:00:00.000Z',
      },
    ]);
    process.env.NOUS_PUBLIC_MCP_TUNNEL_SESSIONS_JSON = JSON.stringify([
      {
        sessionId: 'session-1',
        userHandle: 'casey',
        host: 'casey.tunnel.nous.run',
        sharedSecret: '0123456789abcdef0123456789abcdef',
        status: 'active',
        createdAt: '2026-03-14T00:00:00.000Z',
        updatedAt: '2026-03-14T00:00:00.000Z',
      },
    ]);
    clearNousContextCache();

    const ctx = createNousContext();
    const subject: PublicMcpSubject = {
      class: 'ExternalClient' as const,
      clientId: 'client-1',
      clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      scopes: ['ortho.system.read'],
      audience: 'urn:nous:ortho:mcp',
    };

    const hosted = await ctx.publicMcpGatewayService.execute({
      requestId: '550e8400-e29b-41d4-a716-446655440010',
      jsonrpc: '2.0',
      rpcId: 'rpc-hosted',
      protocolVersion: '2025-11-25',
      method: 'tools/call',
      toolName: 'ortho.system.v1.info',
      arguments: {},
      subject,
      requestUrl: 'https://andre.nous.run/mcp',
      requestedAt: '2026-03-14T00:00:00.000Z',
    });
    const tunnel = await ctx.publicMcpGatewayService.execute({
      requestId: '550e8400-e29b-41d4-a716-446655440011',
      jsonrpc: '2.0',
      rpcId: 'rpc-tunnel',
      protocolVersion: '2025-11-25',
      method: 'tools/call',
      toolName: 'ortho.system.v1.info',
      arguments: {},
      subject,
      requestUrl: 'https://casey.tunnel.nous.run/mcp',
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    expect((hosted.result as { server: { backendMode: string } }).server.backendMode).toBe(
      'hosted',
    );
    expect((tunnel.result as { server: { backendMode: string } }).server.backendMode).toBe(
      'local_tunnel',
    );
  });
});
