import { describe, expect, it } from 'vitest';
import { WitnessService } from '@nous/subcortex-witnessd';
import { AuditProjectionStore } from '../audit-projection-store.js';
import { PublicMcpGatewayService } from '../public-mcp-gateway-service.js';
import { createMemoryDocumentStore } from './test-store.js';

function encodeClaims(claims: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
}

describe('Public MCP audit projection', () => {
  it('records witness-linked audit rows for completed initialize requests', async () => {
    const documentStore = createMemoryDocumentStore();
    const witnessService = new WitnessService(documentStore);
    const auditStore = new AuditProjectionStore(documentStore);
    const service = new PublicMcpGatewayService({
      documentStore,
      auditStore,
      witnessService,
      executionBridge: {
        listTools: async () => [],
        executeMappedTool: async () => ({
          requestId: 'unused',
          httpStatus: 404,
          rejectReason: 'tool_not_available',
          error: { code: -32601, message: 'Tool not available.' },
        }),
      },
    });

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
        method: 'initialize',
        params: {},
      },
    });

    const result = await service.execute({
      requestId: decision.requestId,
      jsonrpc: '2.0',
      rpcId: 'rpc-1',
      protocolVersion: '2025-11-25',
      method: 'initialize',
      subject: decision.subject!,
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    const audit = await auditStore.get(decision.requestId);

    expect(result.authorizationEventId).toBeTruthy();
    expect(result.completionEventId).toBeTruthy();
    expect(audit?.oauthClientId).toBe('client-1');
    expect(audit?.outcome).toBe('completed');
    expect(audit?.authorizationEventId).toBe(result.authorizationEventId);
  });

  it('records witness-linked audit rows for rejected auth requests', async () => {
    const documentStore = createMemoryDocumentStore();
    const witnessService = new WitnessService(documentStore);
    const auditStore = new AuditProjectionStore(documentStore);
    const service = new PublicMcpGatewayService({
      documentStore,
      auditStore,
      witnessService,
    });

    const decision = await service.authorize({
      requestId: '550e8400-e29b-41d4-a716-446655440001',
      method: 'POST',
      url: 'http://localhost:3000/mcp',
      headers: {},
      body: {
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/list',
        params: {},
      },
    });

    const audit = await auditStore.get(decision.requestId);

    expect(decision.rejectReason).toBe('missing_bearer');
    expect(decision.witnessRefs).toHaveLength(2);
    expect(audit?.outcome).toBe('rejected');
    expect(audit?.rejectReason).toBe('missing_bearer');
  });
});
