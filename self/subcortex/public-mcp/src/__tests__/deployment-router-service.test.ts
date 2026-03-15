import type { PublicMcpExecutionRequest } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { DeploymentRouterService } from '../deployment-router-service.js';
import { HostedTenantBindingStore } from '../hosted-tenant-binding-store.js';
import { TunnelSessionStore } from '../tunnel-session-store.js';
import { createMemoryDocumentStore } from './test-store.js';

function createRequest(requestUrl: string): PublicMcpExecutionRequest {
  return {
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    jsonrpc: '2.0' as const,
    rpcId: 'rpc-1',
    protocolVersion: '2025-11-25' as const,
    method: 'tools/call' as const,
    toolName: 'ortho.system.v1.info',
    arguments: {},
    subject: {
      class: 'ExternalClient' as const,
      clientId: 'client-1',
      clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      scopes: ['ortho.system.read'],
      audience: 'urn:nous:ortho:mcp',
    },
    requestUrl,
    requestedAt: '2026-03-14T00:00:00.000Z',
  };
}

describe('DeploymentRouterService', () => {
  it('resolves hosted, tunnel, and development backends from request host', async () => {
    const documentStore = createMemoryDocumentStore();
    const router = new DeploymentRouterService({
      hostedTenantBindingStore: new HostedTenantBindingStore(documentStore, {
        seedRecords: [
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
        ],
      }),
      tunnelSessionStore: new TunnelSessionStore(documentStore, {
        seedRecords: [
          {
            sessionId: 'session-1',
            userHandle: 'casey',
            host: 'casey.tunnel.nous.run',
            sharedSecret: '0123456789abcdef0123456789abcdef',
            status: 'active',
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
          },
        ],
      }),
      developmentHosts: ['localhost:3000'],
    });

    expect((await router.resolve(createRequest('https://andre.nous.run/mcp'))).mode).toBe(
      'hosted',
    );
    expect(
      (await router.resolve(createRequest('https://casey.tunnel.nous.run/mcp'))).mode,
    ).toBe('local_tunnel');
    expect((await router.resolve(createRequest('http://localhost:3000/mcp'))).mode).toBe(
      'development',
    );
  });

  it('fails closed for an unknown public host', async () => {
    const router = new DeploymentRouterService({
      hostedTenantBindingStore: new HostedTenantBindingStore(createMemoryDocumentStore()),
      tunnelSessionStore: new TunnelSessionStore(createMemoryDocumentStore()),
      developmentHosts: ['localhost:3000'],
    });

    await expect(router.resolve(createRequest('https://unknown.nous.run/mcp'))).rejects.toThrow(
      'No public MCP deployment resolved',
    );
  });
});
