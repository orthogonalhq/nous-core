import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  AppActivationHandshakeSchema,
  AppConnectorEgressIntentSchema,
  AppConnectorIngressIntentSchema,
  AppConnectorSessionReportSchema,
  AppOutboundToolCallContextSchema,
  type AppActivationHandshake,
  type AppConnectorEgressIntent,
  type AppConnectorIngressIntent,
  type AppConnectorSessionReport,
  type AppOutboundToolCallContext,
  type AppPanelPersistedStateDeleteInput,
  type AppPanelPersistedStateGetInput,
  type AppPanelPersistedStateResult,
  AppPanelPersistedStateResultSchema,
  type AppPanelPersistedStateSetInput,
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
  invokeTool?: (sessionId: string, envelope: AppOutboundToolEnvelope) => Promise<unknown> | unknown;
  getPersistedState?: (
    sessionId: string,
    input: AppPanelPersistedStateGetInput,
  ) => Promise<AppPanelPersistedStateResult> | AppPanelPersistedStateResult;
  setPersistedState?: (
    sessionId: string,
    input: AppPanelPersistedStateSetInput,
  ) => Promise<AppPanelPersistedStateResult> | AppPanelPersistedStateResult;
  deletePersistedState?: (
    sessionId: string,
    input: AppPanelPersistedStateDeleteInput,
  ) => Promise<AppPanelPersistedStateResult> | AppPanelPersistedStateResult;
  projectScopedTools?: readonly string[];
}

interface PersistedStateDocument {
  values: Record<string, { value: unknown; updated_at: string }>;
}

export class McpIpcBridge {
  private readonly projectScopedTools: ReadonlySet<string>;
  private readonly appDataDirs = new Map<string, string>();

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

  registerSessionStorage(sessionId: string, appDataDir: string): void {
    this.appDataDirs.set(sessionId, appDataDir);
  }

  unregisterSessionStorage(sessionId: string): void {
    this.appDataDirs.delete(sessionId);
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

  async invokeTool(payload: unknown): Promise<unknown> {
    const parsed = this.parseOutboundToolEnvelope(payload);
    if (!this.options.invokeTool) {
      throw new NousError(
        'App tool invocation bridge is unavailable',
        'APP_TOOL_BRIDGE_UNAVAILABLE',
      );
    }

    return this.options.invokeTool(parsed.context.session_id, parsed);
  }

  async getPersistedState(
    sessionId: string,
    input: AppPanelPersistedStateGetInput,
  ): Promise<AppPanelPersistedStateResult> {
    if (this.options.getPersistedState) {
      return AppPanelPersistedStateResultSchema.parse(
        await this.options.getPersistedState(sessionId, input),
      );
    }

    const document = await this.readPersistedStateDocument(
      sessionId,
      input.app_id,
      input.panel_id,
    );
    const hit = document.values[input.key];
    return AppPanelPersistedStateResultSchema.parse({
      app_id: input.app_id,
      panel_id: input.panel_id,
      key: input.key,
      exists: Boolean(hit),
      value: hit?.value,
      updated_at: hit?.updated_at ?? new Date().toISOString(),
    });
  }

  async setPersistedState(
    sessionId: string,
    input: AppPanelPersistedStateSetInput,
  ): Promise<AppPanelPersistedStateResult> {
    if (this.options.setPersistedState) {
      return AppPanelPersistedStateResultSchema.parse(
        await this.options.setPersistedState(sessionId, input),
      );
    }

    const document = await this.readPersistedStateDocument(
      sessionId,
      input.app_id,
      input.panel_id,
    );
    const updatedAt = new Date().toISOString();
    document.values[input.key] = {
      value: input.value,
      updated_at: updatedAt,
    };
    await this.writePersistedStateDocument(
      sessionId,
      input.app_id,
      input.panel_id,
      document,
    );

    return AppPanelPersistedStateResultSchema.parse({
      app_id: input.app_id,
      panel_id: input.panel_id,
      key: input.key,
      exists: true,
      value: input.value,
      updated_at: updatedAt,
    });
  }

  async deletePersistedState(
    sessionId: string,
    input: AppPanelPersistedStateDeleteInput,
  ): Promise<AppPanelPersistedStateResult> {
    if (this.options.deletePersistedState) {
      return AppPanelPersistedStateResultSchema.parse(
        await this.options.deletePersistedState(sessionId, input),
      );
    }

    const document = await this.readPersistedStateDocument(
      sessionId,
      input.app_id,
      input.panel_id,
    );
    const current = document.values[input.key];
    delete document.values[input.key];
    await this.writePersistedStateDocument(
      sessionId,
      input.app_id,
      input.panel_id,
      document,
    );

    return AppPanelPersistedStateResultSchema.parse({
      app_id: input.app_id,
      panel_id: input.panel_id,
      key: input.key,
      exists: false,
      updated_at: current?.updated_at ?? new Date().toISOString(),
    });
  }

  parseConnectorIngressIntent(payload: unknown): AppConnectorIngressIntent {
    return AppConnectorIngressIntentSchema.parse(payload);
  }

  parseConnectorEgressIntent(payload: unknown): AppConnectorEgressIntent {
    return AppConnectorEgressIntentSchema.parse(payload);
  }

  parseConnectorSessionReport(payload: unknown): AppConnectorSessionReport {
    return AppConnectorSessionReportSchema.parse(payload);
  }

  private resolvePersistedStateFilePath(
    sessionId: string,
    appId: string,
    panelId: string,
  ): string {
    const appDataDir = this.appDataDirs.get(sessionId);
    if (!appDataDir) {
      throw new NousError(
        `Persisted panel state is unavailable for session ${sessionId}`,
        'APP_PANEL_STATE_UNAVAILABLE',
      );
    }

    return join(
      appDataDir,
      '.nous-panel-state',
      encodeURIComponent(appId),
      `${encodeURIComponent(panelId)}.json`,
    );
  }

  private async readPersistedStateDocument(
    sessionId: string,
    appId: string,
    panelId: string,
  ): Promise<PersistedStateDocument> {
    const filePath = this.resolvePersistedStateFilePath(sessionId, appId, panelId);

    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedStateDocument;
      return {
        values:
          parsed && typeof parsed === 'object' && parsed.values
            ? parsed.values
            : {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { values: {} };
      }
      throw error;
    }
  }

  private async writePersistedStateDocument(
    sessionId: string,
    appId: string,
    panelId: string,
    document: PersistedStateDocument,
  ): Promise<void> {
    const filePath = this.resolvePersistedStateFilePath(sessionId, appId, panelId);
    const hasValues = Object.keys(document.values).length > 0;

    if (!hasValues) {
      try {
        await rm(filePath, { force: true });
      } catch {
        // Empty-state cleanup is best-effort; a stale file only causes a harmless cache miss.
      }
      return;
    }

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify(document, null, 2),
      'utf8',
    );
  }
}
