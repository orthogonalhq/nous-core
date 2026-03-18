import { randomUUID } from 'node:crypto';
import {
  PANEL_BRIDGE_PROTOCOL_VERSION,
  PublicMcpExecutionRequestSchema,
  PublicMcpRpcRequestSchema,
  PanelBridgeToolTransportFailureSchema,
  PanelBridgeToolTransportRequestSchema,
  PanelBridgeToolTransportSuccessSchema,
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

function extractPanelBridgeRequestId(body: unknown): string {
  if (typeof body !== 'object' || body == null) {
    return randomUUID();
  }

  const requestId = (body as { request_id?: unknown }).request_id;
  return typeof requestId === 'string' && requestId.length > 0
    ? requestId
    : randomUUID();
}

async function handlePanelBridgeRequest(
  body: unknown,
): Promise<Response | null> {
  const parsed = PanelBridgeToolTransportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      PanelBridgeToolTransportFailureSchema.parse({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        request_id: extractPanelBridgeRequestId(body),
        ok: false,
        error: {
          code: 'message_invalid',
          message: 'Invalid panel bridge tool request.',
          retryable: false,
        },
      }),
      { status: 400 },
    );
  }

  try {
    const result = await createNousContext().appRuntimeService.executePanelTool(parsed.data);
    return Response.json(
      PanelBridgeToolTransportSuccessSchema.parse({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        request_id: parsed.data.request_id,
        ok: true,
        result,
      }),
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'Panel tool execution failed.';
    const status = message === 'Active app panel not found.' ? 404 : 502;
    return Response.json(
      PanelBridgeToolTransportFailureSchema.parse({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        request_id: parsed.data.request_id,
        ok: false,
        error: {
          code: status === 404 ? 'host_unavailable' : 'tool_execution_failed',
          message,
          retryable: false,
        },
      }),
      { status },
    );
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

  if (request.headers.get('x-nous-panel-bridge') === '1') {
    const panelBridgeResponse = await handlePanelBridgeRequest(body);
    if (panelBridgeResponse) {
      return panelBridgeResponse;
    }
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
      arguments:
        rpcRequest.method === 'tools/call'
          ? rpcRequest.params.arguments
          : rpcRequest.method === 'tasks/get' || rpcRequest.method === 'tasks/result'
            ? rpcRequest.params
            : undefined,
      subject: admission.subject!,
      requestUrl: request.url,
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
