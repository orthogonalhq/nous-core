import {
  AppHealthSnapshotSchema,
  AppProcessExitEventSchema,
  AppRuntimeActivationInputSchema,
  AppRuntimeDeactivationInputSchema,
  AppRuntimeSessionSchema,
  type AppHealthSnapshot,
  type AppProcessExitEvent,
  type AppRuntimeActivationInput,
  type AppRuntimeDeactivationInput,
  type AppRuntimeSession,
  type IAppRuntimeService,
  type IPackageLifecycleOrchestrator,
  type PackageLifecycleTransitionRequest,
} from '@nous/shared';
import { AppHealthRegistry } from './app-health-registry.js';
import { AppToolRegistry, type AppToolRegistryDefinition } from './app-tool-registry.js';
import { DenoSpawner, type DenoSpawnReceipt } from './deno-spawner.js';
import { McpIpcBridge } from './mcp-ipc-bridge.js';
import { PanelRegistrationRegistry } from './panel-registration.js';

export interface AppRuntimeServiceOptions {
  lifecycleOrchestrator: IPackageLifecycleOrchestrator;
  spawner?: DenoSpawner;
  bridge?: McpIpcBridge;
  toolRegistry: AppToolRegistry;
  healthRegistry?: AppHealthRegistry;
  panelRegistry?: PanelRegistrationRegistry;
}

export class AppRuntimeService implements IAppRuntimeService {
  private readonly spawner: DenoSpawner;
  private readonly bridge: McpIpcBridge;
  private readonly healthRegistry: AppHealthRegistry;
  private readonly panelRegistry: PanelRegistrationRegistry;
  private readonly sessions = new Map<string, AppRuntimeSession>();
  private readonly receipts = new Map<string, DenoSpawnReceipt>();

  constructor(private readonly options: AppRuntimeServiceOptions) {
    this.spawner = options.spawner ?? new DenoSpawner();
    this.bridge = options.bridge ?? new McpIpcBridge();
    this.healthRegistry = options.healthRegistry ?? new AppHealthRegistry();
    this.panelRegistry = options.panelRegistry ?? new PanelRegistrationRegistry();
  }

  async activate(input: AppRuntimeActivationInput): Promise<AppRuntimeSession> {
    const parsed = AppRuntimeActivationInputSchema.parse(input);
    const receipt = this.spawner.spawn(parsed.launch_spec);
    const toolDefinitions: AppToolRegistryDefinition[] = parsed.manifest.tools.map((tool: AppRuntimeActivationInput['manifest']['tools'][number]) => ({
      tool_name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
      output_schema: tool.outputSchema,
    }));

    const session = AppRuntimeSessionSchema.parse({
      session_id: receipt.sessionId,
      app_id: parsed.launch_spec.app_id,
      package_id: parsed.launch_spec.package_id,
      package_version: parsed.launch_spec.package_version,
      project_id: parsed.project_id,
      pid: Math.max(receipt.pid, 1),
      status: 'starting',
      started_at: receipt.startedAt,
      registered_tool_ids: [],
      panel_ids: [],
      health_status: 'healthy',
      config_version: parsed.launch_spec.config_version,
    });

    this.sessions.set(session.session_id, session);
    this.receipts.set(session.session_id, receipt);
    this.healthRegistry.initializeSession(session.session_id);

    try {
      const toolRecords = await this.options.toolRegistry.registerSessionTools({
        appId: session.app_id,
        sessionId: session.session_id,
        definitions: toolDefinitions,
      });
      const panels = this.panelRegistry.registerPanels(session.session_id, parsed.panels);
      const activeSession = this.updateSession({
        ...session,
        status: 'active',
        registered_tool_ids: toolRecords.map((record) => record.namespaced_tool_id),
        panel_ids: panels.map((panel) => panel.panel_id),
      });

      await this.bridge.sendActivationHandshake(activeSession, parsed);
      await this.runLifecycleTransition(parsed, 'run');
      return activeSession;
    } catch (error) {
      await this.options.toolRegistry.deregisterSessionTools(session.session_id);
      this.panelRegistry.unregisterSession(session.session_id);
      this.healthRegistry.removeSession(session.session_id);
      this.receipts.get(session.session_id)?.handle.kill();
      this.receipts.delete(session.session_id);
      this.sessions.delete(session.session_id);
      throw error;
    }
  }

  async deactivate(
    input: AppRuntimeDeactivationInput,
  ): Promise<AppRuntimeSession | null> {
    const parsed = AppRuntimeDeactivationInputSchema.parse(input);
    const current = this.sessions.get(parsed.session_id);
    if (!current) {
      return null;
    }

    const draining = this.updateSession({
      ...current,
      status: 'draining',
    });

    await this.options.toolRegistry.deregisterSessionTools(parsed.session_id);
    this.panelRegistry.unregisterSession(parsed.session_id);
    this.receipts.get(parsed.session_id)?.handle.kill();
    this.receipts.delete(parsed.session_id);
    this.healthRegistry.removeSession(parsed.session_id);

    if (parsed.disable_package) {
      await this.runLifecycleTransition(
        {
          project_id: draining.project_id,
          launch_spec: {
            package_id: draining.package_id,
            package_version: draining.package_version,
          } as AppRuntimeActivationInput['launch_spec'],
        } as AppRuntimeActivationInput,
        'disable',
      );
    }

    return this.updateSession({
      ...draining,
      status: 'stopped',
      stopped_at: new Date().toISOString(),
      registered_tool_ids: [],
      panel_ids: [],
    });
  }

  async handleProcessExit(
    input: AppProcessExitEvent,
  ): Promise<AppRuntimeSession | null> {
    const parsed = AppProcessExitEventSchema.parse(input);
    const current = this.sessions.get(parsed.session_id);
    if (!current) {
      return null;
    }

    await this.options.toolRegistry.deregisterSessionTools(parsed.session_id);
    this.panelRegistry.unregisterSession(parsed.session_id);
    this.healthRegistry.removeSession(parsed.session_id);
    this.receipts.delete(parsed.session_id);

    return this.updateSession({
      ...current,
      status: 'failed',
      stopped_at: parsed.occurred_at,
      registered_tool_ids: [],
      panel_ids: [],
    });
  }

  async getSession(sessionId: string): Promise<AppRuntimeSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async listSessions(packageId?: string): Promise<AppRuntimeSession[]> {
    const sessions = [...this.sessions.values()];
    return packageId
      ? sessions.filter((session) => session.package_id === packageId)
      : sessions;
  }

  async recordHeartbeat(signal: import('@nous/shared').AppHeartbeatSignal): Promise<AppHealthSnapshot> {
    const snapshot = this.healthRegistry.recordHeartbeat(signal);
    const current = this.sessions.get(snapshot.session_id);
    if (current) {
      this.updateSession({
        ...current,
        health_status: snapshot.status,
        last_heartbeat_at: snapshot.reported_at,
      });
    }
    return snapshot;
  }

  async updateHealth(snapshot: AppHealthSnapshot): Promise<AppHealthSnapshot> {
    const parsed = AppHealthSnapshotSchema.parse(snapshot);
    this.healthRegistry.updateSnapshot(parsed);
    const current = this.sessions.get(parsed.session_id);
    if (current) {
      this.updateSession({
        ...current,
        health_status: parsed.status,
        last_heartbeat_at: parsed.reported_at,
      });
    }
    return parsed;
  }

  private updateSession(session: AppRuntimeSession): AppRuntimeSession {
    const parsed = AppRuntimeSessionSchema.parse(session);
    this.sessions.set(parsed.session_id, parsed);
    return parsed;
  }

  private async runLifecycleTransition(
    input: Pick<AppRuntimeActivationInput, 'project_id' | 'launch_spec'>,
    transition: 'run' | 'disable',
  ): Promise<void> {
    const projectId = input.project_id;
    if (!projectId) {
      return;
    }

    const request: PackageLifecycleTransitionRequest = {
      project_id: projectId,
      package_id: input.launch_spec.package_id,
      package_version: input.launch_spec.package_version,
      origin_class: 'nous_first_party',
      target_transition: transition,
      actor_id: 'app-runtime-service',
    };

    if (transition === 'run') {
      await this.options.lifecycleOrchestrator.run(request);
      return;
    }

    await this.options.lifecycleOrchestrator.disable(request);
  }
}
