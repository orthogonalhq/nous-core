import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PANEL_BRIDGE_PROTOCOL_VERSION } from '@nous/shared';
import { PUBLIC_MCP_AUDIT_COLLECTION } from '@nous/subcortex-public-mcp';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { POST } from '../../app/mcp/route';

function encodeClaims(claims: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('public MCP route', () => {
  afterEach(() => {
    delete process.env.NOUS_PUBLIC_MCP_HOSTED_BINDINGS_JSON;
    delete process.env.NOUS_PUBLIC_MCP_TUNNEL_SESSIONS_JSON;
    clearNousContextCache();
  });

  it('routes trusted panel bridge requests through the MCP endpoint without public bearer auth', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-public-mcp-${randomUUID()}`);
    clearNousContextCache();
    const ctx = createNousContext();
    const executePanelTool = vi
      .spyOn(ctx.appRuntimeService, 'executePanelTool')
      .mockResolvedValue({
        forecast: 'rain',
      });

    const response = await POST(
      new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nous-panel-bridge': '1',
        },
        body: JSON.stringify({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          request_id: 'req-1',
          app_id: 'app:weather',
          panel_id: 'forecast',
          tool_name: 'get_forecast',
          params: {
            city: 'Seattle',
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result).toEqual({
      forecast: 'rain',
    });
    expect(executePanelTool).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: 'get_forecast',
      }),
    );
  });

  it('rejects missing bearer before tool execution', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-public-mcp-${randomUUID()}`);
    clearNousContextCache();

    const response = await POST(new Request('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/list',
        params: {},
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.data.rejectReason).toBe('missing_bearer');
  });

  it('returns the Phase 13.3 public-safe tool list for a system-read subject', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-public-mcp-${randomUUID()}`);
    clearNousContextCache();

    const requestId = '550e8400-e29b-41d4-a716-446655440000';
    const response = await POST(new Request('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': requestId,
        authorization: `Bearer ${encodeClaims({
          clientId: 'client-1',
          audience: 'urn:nous:ortho:mcp',
          scopes: ['ortho.system.read'],
          expiresAt: '2030-01-01T00:00:00.000Z',
        })}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/list',
        params: {},
      }),
    }));
    const body = await response.json();
    const audit = await createNousContext().documentStore.get(
      PUBLIC_MCP_AUDIT_COLLECTION,
      requestId,
    );

    expect(response.status).toBe(200);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'ortho.agents.v1.list',
      'ortho.system.v1.info',
    ]);
    expect(audit).not.toBeNull();
  });

  it('creates a public invoke task and serves subject-scoped task results', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-public-mcp-${randomUUID()}`);
    clearNousContextCache();

    const response = await POST(new Request('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${encodeClaims({
          clientId: 'client-1',
          audience: 'urn:nous:ortho:mcp',
          scopes: ['ortho.agents.invoke', 'ortho.system.read'],
          expiresAt: '2030-01-01T00:00:00.000Z',
        })}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/call',
        params: {
          name: 'ortho.agents.v1.invoke',
          arguments: {
            agentId: 'engineering.workflow',
            input: {
              type: 'text',
              text: 'Summarize the current public invoke contract.',
            },
            executionMode: 'async',
          },
        },
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.mode).toBe('task');
    expect(body.result.task.status).toBe('queued');

    await wait(50);

    const taskResultResponse = await POST(new Request('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${encodeClaims({
          clientId: 'client-1',
          audience: 'urn:nous:ortho:mcp',
          scopes: ['ortho.agents.invoke', 'ortho.system.read'],
          expiresAt: '2030-01-01T00:00:00.000Z',
        })}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'rpc-2',
        method: 'tasks/result',
        params: {
          taskId: body.result.task.taskId,
        },
      }),
    }));
    const taskResultBody = await taskResultResponse.json();

    expect(taskResultResponse.status).toBe(200);
    expect(taskResultBody.result.status).toBe('completed');
    expect(taskResultBody.result.result.outputs[0].type).toBe('text');
  });

  it('keeps one public route while selecting the hosted backend from the request host', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-public-mcp-${randomUUID()}`);
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
    clearNousContextCache();

    const response = await POST(new Request('https://andre.nous.run/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${encodeClaims({
          clientId: 'client-1',
          audience: 'urn:nous:ortho:mcp',
          scopes: ['ortho.system.read'],
          expiresAt: '2030-01-01T00:00:00.000Z',
        })}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/call',
        params: {
          name: 'ortho.system.v1.info',
          arguments: {},
        },
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.server.backendMode).toBe('hosted');
    expect(body.result.server.name).toBe('Andre Hosted Nous');
  });

  it('keeps one public route while selecting the tunnel backend from the request host', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-public-mcp-${randomUUID()}`);
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

    const response = await POST(new Request('https://casey.tunnel.nous.run/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${encodeClaims({
          clientId: 'client-1',
          audience: 'urn:nous:ortho:mcp',
          scopes: ['ortho.system.read'],
          expiresAt: '2030-01-01T00:00:00.000Z',
        })}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/call',
        params: {
          name: 'ortho.system.v1.info',
          arguments: {},
        },
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.server.backendMode).toBe('local_tunnel');
  });
});
