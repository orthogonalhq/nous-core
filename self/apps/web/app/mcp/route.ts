import { randomUUID } from 'node:crypto';
import {
  PublicMcpExecutionRequestSchema,
  PublicMcpRpcRequestSchema,
  type PublicMcpRejectReason,
} from '@nous/shared';
import { createNousContext } from '@/server/bootstrap';

function collectHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function extractRpcId(body: unknown): string | number | null {
  if (typeof body !== 'object' || body == null) {
    return null;
  }

  const rpcId = (body as { id?: unknown }).id;
  return typeof rpcId === 'string' || typeof rpcId === 'number' ? rpcId : null;
}

function mapRejectCode(reason?: PublicMcpRejectReason): number {
  switch (reason) {
    case 'request_schema_invalid':
      return -32600;
    case 'tool_not_available':
      return -32601;
    case 'phase_not_enabled':
      return -32004;
    case 'source_quarantined':
      return -32006;
    case 'quota_exceeded':
      return -32007;
    case 'rate_limited':
      return -32008;
    case 'missing_bearer':
    case 'invalid_token':
    case 'expired_token':
    case 'audience_mismatch':
      return -32001;
    default:
      return -32003;
  }
}

export async function POST(request: Request): Promise<Response> {
  const ctx = createNousContext();
  const requestId = request.headers.get('x-request-id') ?? randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const admission = await ctx.publicMcpGatewayService.authorize({
    requestId,
    method: 'POST',
    url: request.url,
    headers: collectHeaders(request),
    body,
    origin: request.headers.get('origin') ?? undefined,
  });

  if (admission.outcome === 'rejected') {
    return Response.json(
      {
        jsonrpc: '2.0',
        id: extractRpcId(body),
        error: {
          code: mapRejectCode(admission.rejectReason),
          message: 'Public MCP request rejected.',
          data: {
            rejectReason: admission.rejectReason,
            requestId: admission.requestId,
          },
        },
      },
      {
        status: admission.httpStatus,
        headers:
          admission.httpStatus === 401
            ? { 'WWW-Authenticate': 'Bearer realm="nous-public-mcp"' }
            : undefined,
      },
    );
  }

  const rpcRequest = PublicMcpRpcRequestSchema.parse(body);
  const execution = await ctx.publicMcpGatewayService.execute(
    PublicMcpExecutionRequestSchema.parse({
      requestId,
      jsonrpc: '2.0',
      rpcId: rpcRequest.id,
      protocolVersion:
        rpcRequest.method === 'initialize'
          ? (rpcRequest.params?.protocolVersion ?? '2025-11-25')
          : '2025-11-25',
      method: rpcRequest.method,
      toolName: rpcRequest.method === 'tools/call' ? rpcRequest.params.name : undefined,
      arguments: rpcRequest.method === 'tools/call' ? rpcRequest.params.arguments : undefined,
      subject: admission.subject!,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
      requestedAt: new Date().toISOString(),
    }),
  );

  if (execution.error) {
    return Response.json(
      {
        jsonrpc: '2.0',
        id: execution.rpcId ?? null,
        error: execution.error,
      },
      { status: execution.httpStatus },
    );
  }

  return Response.json(
    {
      jsonrpc: '2.0',
      id: execution.rpcId ?? null,
      result: execution.result,
    },
    { status: execution.httpStatus },
  );
}

export async function GET(): Promise<Response> {
  return new Response('Method Not Allowed', { status: 405 });
}
