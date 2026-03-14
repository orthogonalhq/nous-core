import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
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
    clearNousContextCache();
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
});
