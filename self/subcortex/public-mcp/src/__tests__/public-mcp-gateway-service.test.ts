import { describe, expect, it } from 'vitest';
import { WitnessService } from '@nous/subcortex-witnessd';
import { PublicMcpGatewayService } from '../public-mcp-gateway-service.js';
import { createMemoryDocumentStore } from './test-store.js';

function encodeClaims(claims: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
}

describe('PublicMcpGatewayService', () => {
  it('builds discovery docs and executes tools/list through the injected bridge', async () => {
    const documentStore = createMemoryDocumentStore();
    const witnessService = new WitnessService(documentStore);
    const service = new PublicMcpGatewayService({
      documentStore,
      witnessService,
      supportedScopes: ['ortho.system.read'],
      executionBridge: {
        listTools: async () => [
          {
            name: 'ortho.system.v1.info',
            version: '1.0.0',
            description: 'System info',
            inputSchema: {},
            outputSchema: {},
            capabilities: ['external'],
            permissionScope: 'external',
          },
        ],
        executeMappedTool: async () => ({
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          httpStatus: 404,
          rejectReason: 'tool_not_available',
          error: { code: -32601, message: 'Tool not available.' },
        }),
      },
    });

    const discovery = await service.getDiscoveryDocuments();
    expect(discovery.protectedResourceMetadata.authorization_servers).toHaveLength(1);

    const decision = await service.authorize({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      method: 'POST',
      url: 'http://localhost:3000/mcp',
      headers: {
        authorization: `Bearer ${encodeClaims({
          clientId: 'client-1',
          audience: 'urn:nous:ortho:mcp',
          scopes: ['ortho.system.read'],
          expiresAt: '2030-01-01T00:00:00.000Z',
        })}`,
      },
      body: {
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/list',
        params: {},
      },
    });
    const result = await service.execute({
      requestId: decision.requestId,
      jsonrpc: '2.0',
      rpcId: 'rpc-1',
      protocolVersion: '2025-11-25',
      method: 'tools/list',
      subject: decision.subject!,
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    expect((result.result as { tools: Array<{ name: string }> }).tools).toEqual([
      expect.objectContaining({ name: 'ortho.system.v1.info' }),
    ]);
    expect(result.authorizationEventId).toBeTruthy();
    expect(result.auditRecordId).toBe(decision.requestId);
  });
});
