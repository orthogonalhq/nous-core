import {
  AppActivationHandshakeSchema,
  AppOutboundToolCallContextSchema,
  type AppActivationHandshake,
  type AppOutboundToolCallContext,
  type AppRuntimeActivationInput,
  type AppRuntimeSession,
} from '@nous/shared';
import { NousError } from '@nous/shared';
import { z } from 'zod';

const AppOutboundToolEnvelopeSchema = z.object({
  context: AppOutboundToolCallContextSchema,
  params: z.unknown().optional(),
});

export interface AppOutboundToolEnvelope {
  context: AppOutboundToolCallContext;
  params?: unknown;
}

export interface McpIpcBridgeOptions {
  sendHandshake?: (sessionId: string, handshake: AppActivationHandshake) => Promise<void> | void;
  projectScopedTools?: readonly string[];
}

export class McpIpcBridge {
  private readonly projectScopedTools: ReadonlySet<string>;

  constructor(private readonly options: McpIpcBridgeOptions = {}) {
    this.projectScopedTools = new Set(options.projectScopedTools ?? [
      'memory_write',
      'project_discover',
      'artifact_store',
      'artifact_retrieve',
      'tool_execute',
      'tool_list',
      'escalation_notify',
      'scheduler_register',
    ]);
  }

  createActivationHandshake(
    session: AppRuntimeSession,
    input: AppRuntimeActivationInput,
  ): AppActivationHandshake {
    return AppActivationHandshakeSchema.parse({
      session_id: session.session_id,
      app_id: session.app_id,
      package_id: session.package_id,
      package_version: session.package_version,
      allowed_outbound_tools: input.allowed_outbound_tools,
      config: input.config,
      permissions: input.launch_spec.compiled_permissions,
      panels: input.panels,
    });
  }

  async sendActivationHandshake(
    session: AppRuntimeSession,
    input: AppRuntimeActivationInput,
  ): Promise<AppActivationHandshake> {
    const handshake = this.createActivationHandshake(session, input);
    await this.options.sendHandshake?.(session.session_id, handshake);
    return handshake;
  }

  parseOutboundToolEnvelope(payload: unknown): AppOutboundToolEnvelope {
    const parsed = AppOutboundToolEnvelopeSchema.parse(payload);
    if (
      this.projectScopedTools.has(parsed.context.tool_id) &&
      !parsed.context.project_id
    ) {
      throw new NousError(
        `App tool ${parsed.context.tool_id} requires explicit project_id`,
        'PROJECT_SCOPE_REQUIRED',
      );
    }

    return parsed;
  }
}
