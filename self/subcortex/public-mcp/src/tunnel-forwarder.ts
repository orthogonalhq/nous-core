import { createHmac, randomUUID } from 'node:crypto';
import type {
  IPublicMcpSurfaceService,
  PublicMcpDeploymentResolution,
  PublicMcpExecutionRequest,
  PublicMcpExecutionResult,
  PublicMcpTunnelForwardEnvelope,
  PublicMcpTunnelSessionRecord,
} from '@nous/shared';
import {
  PublicMcpExecutionResultSchema,
  PublicMcpTunnelForwardEnvelopeSchema,
} from '@nous/shared';
import type { PublicMcpExecutionBridgeLike } from './public-mcp-gateway-service.js';
import { TunnelSessionStore } from './tunnel-session-store.js';

export interface TunnelForwarderOptions {
  sessionStore: TunnelSessionStore;
  now?: () => string;
  idFactory?: () => string;
  ttlMs?: number;
}

export interface TunnelForwardTargetBundle {
  executionBridge?: PublicMcpExecutionBridgeLike;
  surfaceService?: IPublicMcpSurfaceService;
}

function buildSignaturePayload(
  envelope: Omit<PublicMcpTunnelForwardEnvelope, 'signature'>,
): string {
  return JSON.stringify({
    envelopeId: envelope.envelopeId,
    requestId: envelope.requestId,
    sessionId: envelope.sessionId,
    userHandle: envelope.userHandle,
    nonce: envelope.nonce,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    request: envelope.request,
  });
}

function signEnvelope(
  envelope: Omit<PublicMcpTunnelForwardEnvelope, 'signature'>,
  sharedSecret: string,
): string {
  return createHmac('sha256', sharedSecret)
    .update(buildSignaturePayload(envelope))
    .digest('hex');
}

function reject(
  request: PublicMcpExecutionRequest,
  rejectReason: PublicMcpExecutionResult['rejectReason'],
  code: number,
  message: string,
): PublicMcpExecutionResult {
  return PublicMcpExecutionResultSchema.parse({
    requestId: request.requestId,
    httpStatus: 403,
    rpcId: request.rpcId,
    rejectReason,
    error: {
      code,
      message,
      data: { rejectReason },
    },
  });
}

export class TunnelForwarder {
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly ttlMs: number;

  constructor(private readonly options: TunnelForwarderOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 60_000;
  }

  async issueEnvelope(
    request: PublicMcpExecutionRequest,
    resolution: PublicMcpDeploymentResolution,
  ): Promise<PublicMcpTunnelForwardEnvelope> {
    const session = await this.requireSession(resolution);
    const issuedAt = this.now();
    const expiresAt = new Date(Date.parse(issuedAt) + this.ttlMs).toISOString();
    const unsigned = {
      envelopeId: this.idFactory(),
      requestId: request.requestId,
      sessionId: session.sessionId,
      userHandle: session.userHandle,
      nonce: this.idFactory(),
      issuedAt,
      expiresAt,
      request,
    };
    return PublicMcpTunnelForwardEnvelopeSchema.parse({
      ...unsigned,
      signature: signEnvelope(unsigned, session.sharedSecret),
    });
  }

  async forward(
    request: PublicMcpExecutionRequest,
    resolution: PublicMcpDeploymentResolution,
    targets: TunnelForwardTargetBundle,
  ): Promise<PublicMcpExecutionResult> {
    const envelope = await this.issueEnvelope(request, resolution);
    return this.forwardEnvelope(envelope, targets);
  }

  async forwardEnvelope(
    envelope: PublicMcpTunnelForwardEnvelope,
    targets: TunnelForwardTargetBundle,
  ): Promise<PublicMcpExecutionResult> {
    const parsed = PublicMcpTunnelForwardEnvelopeSchema.parse(envelope);
    const session = await this.options.sessionStore.get(parsed.sessionId);
    if (!session || session.status !== 'active') {
      return reject(
        parsed.request,
        'tunnel_envelope_invalid',
        -32012,
        'Tunnel session is unavailable.',
      );
    }

    if (!this.isEnvelopeValidForSession(parsed, session)) {
      return reject(
        parsed.request,
        'tunnel_envelope_invalid',
        -32012,
        'Tunnel forward envelope validation failed.',
      );
    }

    const nonceAccepted = await this.options.sessionStore.consumeNonce(
      session.sessionId,
      parsed.nonce,
      this.now(),
      parsed.expiresAt,
    );
    if (!nonceAccepted) {
      return reject(
        parsed.request,
        'tunnel_replay_detected',
        -32013,
        'Tunnel forward envelope replay detected.',
      );
    }

    await this.options.sessionStore.touch(session.sessionId, this.now());

    if (parsed.request.method === 'tasks/get') {
      const task = await targets.surfaceService?.getTask({
        requestId: parsed.request.requestId,
        subject: parsed.request.subject,
        taskId: String(parsed.request.arguments?.taskId ?? ''),
        requestedAt: parsed.request.requestedAt,
      });
      return PublicMcpExecutionResultSchema.parse({
        requestId: parsed.request.requestId,
        httpStatus: task ? 200 : 404,
        rpcId: parsed.request.rpcId,
        result: task ?? undefined,
        rejectReason: task ? undefined : 'task_not_found',
        error: task
          ? undefined
          : {
              code: -32010,
              message: 'Task not found.',
            },
      });
    }

    if (parsed.request.method === 'tasks/result') {
      const taskResult = await targets.surfaceService?.getTaskResult({
        requestId: parsed.request.requestId,
        subject: parsed.request.subject,
        taskId: String(parsed.request.arguments?.taskId ?? ''),
        requestedAt: parsed.request.requestedAt,
      });
      return PublicMcpExecutionResultSchema.parse({
        requestId: parsed.request.requestId,
        httpStatus: taskResult ? 200 : 404,
        rpcId: parsed.request.rpcId,
        result: taskResult ?? undefined,
        rejectReason: taskResult ? undefined : 'task_not_ready',
        error: taskResult
          ? undefined
          : {
              code: -32011,
              message: 'Task result is not available.',
            },
      });
    }

    if (parsed.request.method === 'tools/list') {
      return PublicMcpExecutionResultSchema.parse({
        requestId: parsed.request.requestId,
        httpStatus: 200,
        rpcId: parsed.request.rpcId,
        result: {
          tools: await targets.executionBridge?.listTools(parsed.request.subject),
        },
      });
    }

    if (parsed.request.method === 'initialize') {
      return PublicMcpExecutionResultSchema.parse({
        requestId: parsed.request.requestId,
        httpStatus: 200,
        rpcId: parsed.request.rpcId,
        result: {
          protocolVersion: parsed.request.protocolVersion,
          serverInfo: {
            name: 'Nous Public MCP',
            version: '0.0.1',
          },
          capabilities: {
            tools: {
              listChanged: false,
            },
            tasks: {},
          },
        },
      });
    }

    return (
      (await targets.executionBridge?.executeMappedTool(parsed.request)) ??
      reject(parsed.request, 'tool_not_available', -32601, 'Tool not available.')
    );
  }

  private async requireSession(
    resolution: PublicMcpDeploymentResolution,
  ): Promise<PublicMcpTunnelSessionRecord> {
    if (!resolution.sessionId) {
      throw new Error('Tunnel resolution is missing sessionId');
    }
    const session = await this.options.sessionStore.get(resolution.sessionId);
    if (!session || session.status !== 'active') {
      throw new Error(`Tunnel session ${resolution.sessionId} is unavailable`);
    }
    return session;
  }

  private isEnvelopeValidForSession(
    envelope: PublicMcpTunnelForwardEnvelope,
    session: PublicMcpTunnelSessionRecord,
  ): boolean {
    const requestHost = envelope.request.requestUrl
      ? new URL(envelope.request.requestUrl).host.toLowerCase()
      : session.host.toLowerCase();
    if (requestHost !== session.host.toLowerCase()) {
      return false;
    }
    if (envelope.userHandle !== session.userHandle) {
      return false;
    }
    if (session.expiresAt && session.expiresAt < this.now()) {
      return false;
    }
    if (envelope.expiresAt < this.now()) {
      return false;
    }
    return signEnvelope(
      {
        envelopeId: envelope.envelopeId,
        requestId: envelope.requestId,
        sessionId: envelope.sessionId,
        userHandle: envelope.userHandle,
        nonce: envelope.nonce,
        issuedAt: envelope.issuedAt,
        expiresAt: envelope.expiresAt,
        request: envelope.request,
      },
      session.sharedSecret,
    ) === envelope.signature;
  }
}
