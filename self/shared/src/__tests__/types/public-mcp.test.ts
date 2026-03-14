import { describe, expect, it } from 'vitest';
import {
  PublicMcpAuditRecordSchema,
  PublicMcpDiscoveryBundleSchema,
  PublicMcpExecutionRequestSchema,
  PublicMcpNamespaceRecordSchema,
  PublicMcpRpcRequestSchema,
  PublicMcpToolMappingEntrySchema,
} from '../../types/public-mcp.js';

describe('public MCP shared types', () => {
  it('parses discovery documents', () => {
    const parsed = PublicMcpDiscoveryBundleSchema.parse({
      protectedResourceMetadata: {
        resource: 'urn:nous:ortho:mcp',
        authorization_servers: ['https://auth.example.com'],
        bearer_methods_supported: ['header'],
      },
      authorizationServerMetadata: {
        issuer: 'https://auth.example.com',
        token_endpoint: 'https://auth.example.com/token',
        scopes_supported: ['ortho.system.read'],
      },
    });

    expect(parsed.authorizationServerMetadata.issuer).toBe('https://auth.example.com');
  });

  it('parses tool mappings and normalized execution requests', () => {
    const mapping = PublicMcpToolMappingEntrySchema.parse({
      externalName: 'ortho.system.v1.info',
      internalName: 'public_system_info',
      requiredScopes: ['ortho.system.read'],
      phaseAvailability: '13.3',
      enabledInCurrentPhase: false,
      bootstrapMode: 'none',
    });
    const rpc = PublicMcpRpcRequestSchema.parse({
      jsonrpc: '2.0',
      id: 'rpc-1',
      method: 'tools/call',
      params: {
        name: mapping.externalName,
        arguments: {
          namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        },
      },
    });
    if (rpc.method !== 'tools/call') {
      throw new Error('Expected tools/call RPC request');
    }
    const execution = PublicMcpExecutionRequestSchema.parse({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      jsonrpc: '2.0',
      rpcId: rpc.id,
      protocolVersion: '2025-11-25',
      method: 'tools/call',
      toolName: mapping.externalName,
      arguments: rpc.params.arguments,
      subject: {
        class: 'ExternalClient',
        clientId: 'client-1',
        clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        scopes: ['ortho.system.read'],
        audience: 'urn:nous:ortho:mcp',
      },
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    expect(execution.toolName).toBe(mapping.externalName);
  });

  it('requires external-only namespace records and audit fields', () => {
    const namespace = PublicMcpNamespaceRecordSchema.parse({
      namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      clientId: 'client-1',
      clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      stmCollection: 'external:stm:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      ltmCollection: 'external:ltm:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      mutationAuditCollection: 'external:audit:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      tombstoneCollection: 'external:tombstones:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      vectorCollection: 'external:vectors:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:default',
      bootstrapState: 'ready',
      createdAt: '2026-03-14T00:00:00.000Z',
      lastSeenAt: '2026-03-14T00:00:00.000Z',
    });
    const audit = PublicMcpAuditRecordSchema.parse({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2026-03-14T00:00:00.000Z',
      oauthClientId: 'client-1',
      namespace: namespace.namespace,
      toolName: 'ortho.system.v1.info',
      internalToolName: 'public_system_info',
      outcome: 'blocked',
      rejectReason: 'phase_not_enabled',
      latencyMs: 12,
      authorizationEventId: '550e8400-e29b-41d4-a716-446655440001' as any,
      completionEventId: '550e8400-e29b-41d4-a716-446655440002' as any,
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    expect(audit.namespace).toBe(namespace.namespace);
  });
});
