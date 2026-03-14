import { describe, expect, it, vi } from 'vitest';
import { WitnessService } from '@nous/subcortex-witnessd';
import { PublicMcpGatewayService } from '../public-mcp-gateway-service.js';
import { NamespaceRegistryStore } from '../namespace-registry-store.js';
import { createMemoryDocumentStore } from './test-store.js';

function encodeClaims(claims: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
}

describe('PublicMcpGatewayService authorize', () => {
  it('rejects missing bearer before any bridge or bootstrap work', async () => {
    const documentStore = createMemoryDocumentStore();
    const namespaceStore = new NamespaceRegistryStore(documentStore);
    const ensureNamespace = vi.spyOn(namespaceStore, 'ensureNamespace');
    const executionBridge = {
      listTools: vi.fn().mockResolvedValue([]),
      executeMappedTool: vi.fn(),
    };
    const service = new PublicMcpGatewayService({
      documentStore,
      namespaceStore,
      executionBridge,
      witnessService: new WitnessService(documentStore),
      toolMappingLookup: () => ({
        externalName: 'ortho.system.v1.info',
        internalName: 'public_system_info',
        requiredScopes: ['ortho.system.read'],
        scopeStrategy: 'static',
        phaseAvailability: '13.1',
        enabledInCurrentPhase: true,
        bootstrapMode: 'none',
      }),
    });

    const decision = await service.authorize({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      method: 'POST',
      url: 'http://localhost:3000/mcp',
      headers: {},
      body: {
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/call',
        params: {
          name: 'ortho.system.v1.info',
          arguments: {},
        },
      },
    });

    expect(decision.rejectReason).toBe('missing_bearer');
    expect(executionBridge.executeMappedTool).not.toHaveBeenCalled();
    expect(ensureNamespace).not.toHaveBeenCalled();
  });

  it('rejects insufficient scopes before bridge execution', async () => {
    const documentStore = createMemoryDocumentStore();
    const executionBridge = {
      listTools: vi.fn().mockResolvedValue([]),
      executeMappedTool: vi.fn(),
    };
    const service = new PublicMcpGatewayService({
      documentStore,
      executionBridge,
      witnessService: new WitnessService(documentStore),
      toolMappingLookup: () => ({
        externalName: 'ortho.system.v1.info',
        internalName: 'public_system_info',
        requiredScopes: ['ortho.system.read'],
        scopeStrategy: 'static',
        phaseAvailability: '13.1',
        enabledInCurrentPhase: true,
        bootstrapMode: 'none',
      }),
    });

    const decision = await service.authorize({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      method: 'POST',
      url: 'http://localhost:3000/mcp',
      headers: {
        authorization: `Bearer ${encodeClaims({
          clientId: 'client-1',
          audience: 'urn:nous:ortho:mcp',
          scopes: [],
          expiresAt: '2030-01-01T00:00:00.000Z',
        })}`,
      },
      body: {
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/call',
        params: {
          name: 'ortho.system.v1.info',
          arguments: {},
        },
      },
    });

    expect(decision.rejectReason).toBe('scope_insufficient');
    expect(executionBridge.executeMappedTool).not.toHaveBeenCalled();
  });
});
