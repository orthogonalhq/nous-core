import type { PublicMcpExecutionRequest } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { TunnelForwarder } from '../tunnel-forwarder.js';
import { TunnelSessionStore } from '../tunnel-session-store.js';
import { createMemoryDocumentStore } from './test-store.js';

function createRequest(): PublicMcpExecutionRequest {
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
    requestUrl: 'https://andre.tunnel.nous.run/mcp',
    requestedAt: '2026-03-14T00:00:00.000Z',
  };
}

describe('TunnelForwarder', () => {
  it('forwards a valid signed envelope exactly once', async () => {
    const sessionStore = new TunnelSessionStore(createMemoryDocumentStore(), {
      seedRecords: [
        {
          sessionId: 'session-1',
          userHandle: 'andre',
          host: 'andre.tunnel.nous.run',
          sharedSecret: '0123456789abcdef0123456789abcdef',
          status: 'active',
          createdAt: '2026-03-14T00:00:00.000Z',
          updatedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });
    const forwarder = new TunnelForwarder({
      sessionStore,
      now: () => '2026-03-14T00:00:00.000Z',
      idFactory: (() => {
        const values = ['envelope-1', 'nonce-1'];
        return () => values.shift() ?? 'extra-id';
      })(),
    });
    const request = createRequest();
    const resolution = {
      mode: 'local_tunnel' as const,
      requestHost: 'andre.tunnel.nous.run',
      userHandle: 'andre',
      sessionId: 'session-1',
    };
    const envelope = await forwarder.issueEnvelope(request, resolution);
    const result = await forwarder.forwardEnvelope(envelope, {
      executionBridge: {
        listTools: async () => [],
        executeMappedTool: async () => ({
          requestId: request.requestId,
          httpStatus: 200,
          rpcId: request.rpcId,
          result: { backendMode: 'local_tunnel' },
        }),
      },
    });
    const replay = await forwarder.forwardEnvelope(envelope, {
      executionBridge: {
        listTools: async () => [],
        executeMappedTool: async () => ({
          requestId: request.requestId,
          httpStatus: 200,
          rpcId: request.rpcId,
          result: { ok: true },
        }),
      },
    });

    expect(result.result).toEqual({ backendMode: 'local_tunnel' });
    expect(replay.rejectReason).toBe('tunnel_replay_detected');
  });

  it('rejects tampered or mismatched envelopes', async () => {
    const sessionStore = new TunnelSessionStore(createMemoryDocumentStore(), {
      seedRecords: [
        {
          sessionId: 'session-1',
          userHandle: 'andre',
          host: 'andre.tunnel.nous.run',
          sharedSecret: '0123456789abcdef0123456789abcdef',
          status: 'active',
          createdAt: '2026-03-14T00:00:00.000Z',
          updatedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });
    const forwarder = new TunnelForwarder({
      sessionStore,
      now: () => '2026-03-14T00:00:00.000Z',
    });
    const request = createRequest();
    const envelope = await forwarder.issueEnvelope(request, {
      mode: 'local_tunnel',
      requestHost: 'andre.tunnel.nous.run',
      userHandle: 'andre',
      sessionId: 'session-1',
    });

    const result = await forwarder.forwardEnvelope(
      {
        ...envelope,
        request: {
          ...envelope.request,
          requestUrl: 'https://mallory.tunnel.nous.run/mcp',
        },
      },
      {
        executionBridge: {
          listTools: async () => [],
          executeMappedTool: async () => ({
            requestId: request.requestId,
            httpStatus: 200,
            rpcId: request.rpcId,
            result: { ok: true },
          }),
        },
      },
    );

    expect(result.rejectReason).toBe('tunnel_envelope_invalid');
  });
});
