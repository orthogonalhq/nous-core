import {
  AppConnectorEgressIntentSchema,
  AppConnectorIngressIntentSchema,
  AppConnectorSessionReportSchema,
  AppHealthSnapshotSchema,
  AppPanelLifecycleUpdateSchema,
  AppPanelPersistedStateDeleteInputSchema,
  AppPanelPersistedStateGetInputSchema,
  type AppPanelPersistedStateResult,
  AppPanelPersistedStateSetInputSchema,
  AppProcessExitEventSchema,
  AppRuntimeActivationInputSchema,
  AppRuntimeDeactivationInputSchema,
  AppRuntimeSessionSchema,
  CommunicationConnectorSessionSchema,
  type AppConnectorEgressIntent,
  type AppConnectorIngressIntent,
  type AppConnectorSessionReport,
  type AppHealthSnapshot,
  type CommunicationConnectorSession,
  type CommunicationEgressOutcome,
  type CommunicationIngressOutcome,
  type AppProcessExitEvent,
  type AppRuntimeActivationInput,
  type AppRuntimeDeactivationInput,
  type AppRuntimeSession,
  type IAppRuntimeService,
  type ICommunicationGatewayService,
  type IPackageLifecycleOrchestrator,
  type PanelBridgeToolTransportRequest,
  PanelBridgeToolTransportRequestSchema,
  type PackageLifecycleTransitionRequest,
} from '@nous/shared';
import { AppHealthRegistry } from './app-health-registry.js';
import { AppToolRegistry, type AppToolRegistryDefinition } from './app-tool-registry.js';
import { DenoSpawner, type DenoSpawnReceipt } from './deno-spawner.js';
import { McpIpcBridge } from './mcp-ipc-bridge.js';
import { PanelTranspiler } from './panel-transpiler.js';
import { PanelRegistrationRegistry } from './panel-registration.js';

export interface AppRuntimeServiceOptions {
  lifecycleOrchestrator: IPackageLifecycleOrchestrator;
  spawner?: DenoSpawner;
  bridge?: McpIpcBridge;
  toolRegistry: AppToolRegistry;
  communicationGatewayService?: ICommunicationGatewayService;
  healthRegistry?: AppHealthRegistry;
  panelRegistry?: PanelRegistrationRegistry;
  panelTranspiler?: Pick<PanelTranspiler, 'invalidateSession'>;
}

export class AppRuntimeService implements IAppRuntimeService {
  private readonly spawner: DenoSpawner;
  private readonly bridge: McpIpcBridge;
  private readonly healthRegistry: AppHealthRegistry;
  private readonly panelRegistry: PanelRegistrationRegistry;
  private readonly panelTranspiler?: Pick<PanelTranspiler, 'invalidateSession'>;
  private readonly sessions = new Map<string, AppRuntimeSession>();
  private readonly receipts = new Map<string, DenoSpawnReceipt>();
  private readonly connectorIdsBySession = new Map<string, string[]>();

  constructor(private readonly options: AppRuntimeServiceOptions) {
    this.spawner = options.spawner ?? new DenoSpawner();
    this.bridge = options.bridge ?? new McpIpcBridge();
    this.healthRegistry = options.healthRegistry ?? new AppHealthRegistry();
    this.panelRegistry = options.panelRegistry ?? new PanelRegistrationRegistry();
    this.panelTranspiler = options.panelTranspiler;
  }

  async activate(input: AppRuntimeActivationInput): Promise<AppRuntimeSession> {
    const parsed = AppRuntimeActivationInputSchema.parse(input);
    let session: AppRuntimeSession | null = null;
    let receipt: DenoSpawnReceipt | null = null;

    try {
      receipt = this.spawner.spawn(parsed.launch_spec);
      const toolDefinitions: AppToolRegistryDefinition[] = parsed.manifest.tools.map((tool: AppRuntimeActivationInput['manifest']['tools'][number]) => ({
        tool_name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
        output_schema: tool.outputSchema,
      }));

      session = AppRuntimeSessionSchema.parse({
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
      this.bridge.registerSessionStorage(
        session.session_id,
        parsed.launch_spec.app_data_dir,
      );
      await this.registerConnectorsForSession(parsed, session);

      const toolRecords = await this.options.toolRegistry.registerSessionTools({
        appId: session.app_id,
        sessionId: session.session_id,
        definitions: toolDefinitions,
      });
      const panels = this.panelRegistry.registerPanels({
        session,
        package_root_ref: parsed.package_root_ref,
        manifest_ref: parsed.manifest_ref,
        manifest_config: parsed.manifest.config,
        config_entries: parsed.config,
        panels: parsed.panels,
      });
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
      if (session) {
        await this.options.toolRegistry.deregisterSessionTools(session.session_id);
        this.panelRegistry.unregisterSession(session.session_id);
        await this.invalidateSessionPanelCache(session.session_id);
        this.healthRegistry.removeSession(session.session_id);
        this.bridge.unregisterSessionStorage(session.session_id);
        await this.unregisterConnectorsForSession(session.session_id);
        this.receipts.get(session.session_id)?.handle.kill();
        this.receipts.delete(session.session_id);
        this.sessions.delete(session.session_id);
      } else {
        receipt?.handle.kill();
      }
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
    await this.invalidateSessionPanelCache(parsed.session_id);
    this.receipts.get(parsed.session_id)?.handle.kill();
    this.receipts.delete(parsed.session_id);
    this.healthRegistry.removeSession(parsed.session_id);
    this.bridge.unregisterSessionStorage(parsed.session_id);
    await this.unregisterConnectorsForSession(parsed.session_id);

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
    await this.invalidateSessionPanelCache(parsed.session_id);
    this.healthRegistry.removeSession(parsed.session_id);
    this.receipts.delete(parsed.session_id);
    this.bridge.unregisterSessionStorage(parsed.session_id);
    await this.reportConnectorStateForSession(parsed.session_id, {
      status: 'degraded',
      health: 'unhealthy',
      metadata: {
        reason: parsed.reason ?? 'process_exit',
        code: parsed.code,
        signal: parsed.signal,
      },
      last_seen_at: parsed.occurred_at,
    });
    await this.unregisterConnectorsForSession(parsed.session_id);

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

  async listPanels() {
    return this.panelRegistry.listPanels();
  }

  async resolvePanel(appId: string, panelId: string) {
    return this.panelRegistry.resolvePanel(appId, panelId);
  }

  async executePanelTool(input: PanelBridgeToolTransportRequest): Promise<unknown> {
    const parsed = PanelBridgeToolTransportRequestSchema.parse(input);
    const panel = this.panelRegistry.resolvePanel(parsed.app_id, parsed.panel_id);
    if (!panel) {
      throw new Error('Active app panel not found.');
    }

    return this.bridge.invokeTool({
      context: {
        caller_type: 'app',
        app_id: panel.app_id,
        package_id: panel.package_id,
        session_id: panel.session_id,
        project_id: panel.project_id,
        tool_id: `${panel.app_id}.${parsed.tool_name}`,
        request_id: parsed.request_id,
      },
      params: parsed.params,
    });
  }

  async recordPanelLifecycle(
    input: import('@nous/shared').AppPanelLifecycleUpdate,
  ): Promise<import('@nous/shared').AppPanelBridgeContext | null> {
    const parsed = AppPanelLifecycleUpdateSchema.parse(input);
    return this.panelRegistry.updateLifecycle(parsed);
  }

  async getPersistedPanelState(
    input: import('@nous/shared').AppPanelPersistedStateGetInput,
  ): Promise<AppPanelPersistedStateResult> {
    const parsed = AppPanelPersistedStateGetInputSchema.parse(input);
    const panel = this.panelRegistry.resolvePanel(parsed.app_id, parsed.panel_id);
    if (!panel) {
      throw new Error('Active app panel not found.');
    }

    return this.bridge.getPersistedState(panel.session_id, parsed);
  }

  async setPersistedPanelState(
    input: import('@nous/shared').AppPanelPersistedStateSetInput,
  ): Promise<AppPanelPersistedStateResult> {
    const parsed = AppPanelPersistedStateSetInputSchema.parse(input);
    const panel = this.panelRegistry.resolvePanel(parsed.app_id, parsed.panel_id);
    if (!panel) {
      throw new Error('Active app panel not found.');
    }

    return this.bridge.setPersistedState(panel.session_id, parsed);
  }

  async deletePersistedPanelState(
    input: import('@nous/shared').AppPanelPersistedStateDeleteInput,
  ): Promise<AppPanelPersistedStateResult> {
    const parsed = AppPanelPersistedStateDeleteInputSchema.parse(input);
    const panel = this.panelRegistry.resolvePanel(parsed.app_id, parsed.panel_id);
    if (!panel) {
      throw new Error('Active app panel not found.');
    }

    return this.bridge.deletePersistedState(panel.session_id, parsed);
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

  async submitConnectorIngress(
    input: AppConnectorIngressIntent,
  ): Promise<CommunicationIngressOutcome> {
    const parsed = AppConnectorIngressIntentSchema.parse(input);
    this.assertConnectorIntentOwnership(parsed.session_id, parsed.connector_id);
    const gatewayService = this.requireCommunicationGatewayService();
    return gatewayService.receiveIngress(parsed.envelope);
  }

  async dispatchConnectorEgress(
    input: AppConnectorEgressIntent,
  ): Promise<CommunicationEgressOutcome> {
    const parsed = AppConnectorEgressIntentSchema.parse(input);
    this.assertConnectorIntentOwnership(parsed.session_id, parsed.connector_id);
    const gatewayService = this.requireCommunicationGatewayService();
    return gatewayService.dispatchEgress(parsed.envelope);
  }

  async reportConnectorSession(
    input: AppConnectorSessionReport,
  ): Promise<AppHealthSnapshot> {
    const parsed = AppConnectorSessionReportSchema.parse(input);
    this.assertConnectorIntentOwnership(parsed.session_id, parsed.connector_id);
    const current = this.sessions.get(parsed.session_id);
    const sessionMetadata = CommunicationConnectorSessionSchema.parse({
      connector_id: parsed.connector_id,
      status: parsed.health === 'healthy' ? 'active' : 'degraded',
      health: parsed.health === 'stale' ? 'degraded' : parsed.health,
      last_seen_at: parsed.reported_at,
      metadata: {
        ...parsed.metadata,
        mode: parsed.mode,
        session_id: parsed.session_id,
      },
    });
    await this.requireCommunicationGatewayService().reportConnectorSession(sessionMetadata);
    const snapshot = await this.updateHealth({
      session_id: parsed.session_id,
      status: parsed.health,
      reported_at: parsed.reported_at,
      details: {
        connector_id: parsed.connector_id,
        mode: parsed.mode,
        ...parsed.metadata,
      },
      stale: parsed.health === 'stale',
    });
    if (current) {
      this.updateSession({
        ...current,
        health_status: snapshot.status,
        last_heartbeat_at: snapshot.reported_at,
      });
    }
    return snapshot;
  }

  private updateSession(session: AppRuntimeSession): AppRuntimeSession {
    const parsed = AppRuntimeSessionSchema.parse(session);
    this.sessions.set(parsed.session_id, parsed);
    return parsed;
  }

  private requireCommunicationGatewayService(): ICommunicationGatewayService {
    if (!this.options.communicationGatewayService) {
      throw new Error('Communication gateway service is unavailable');
    }
    return this.options.communicationGatewayService;
  }

  private getConnectorIdsForSession(sessionId: string): string[] {
    return this.connectorIdsBySession.get(sessionId) ?? [];
  }

  private assertConnectorIntentOwnership(
    sessionId: string,
    connectorId: string,
  ): void {
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error(`Unknown app runtime session: ${sessionId}`);
    }
    if (!this.getConnectorIdsForSession(sessionId).includes(connectorId)) {
      throw new Error(
        `Connector ${connectorId} is not registered for session ${sessionId}`,
      );
    }
  }

  private readConfigValue(
    input: Pick<AppRuntimeActivationInput, 'config'>,
    key: string,
  ): string | undefined {
    const entry = input.config.find((candidate) => candidate.key === key);
    return typeof entry?.value === 'string' && entry.value.trim() !== ''
      ? entry.value.trim()
      : undefined;
  }

  private buildConnectorRegistrations(
    input: AppRuntimeActivationInput,
    session: AppRuntimeSession,
  ): Array<{
    connectorId: string;
    accountId: string;
    mode: 'connector' | 'full_client';
  }> {
    const adapters = input.manifest.adapters ?? [];
    const clientCredentialsPresent =
      this.readConfigValue(input, 'client_api_id') &&
      this.readConfigValue(input, 'client_api_hash') &&
      this.readConfigValue(input, 'client_phone_number');
    const accountId =
      this.readConfigValue(input, 'default_account_id') ??
      `account:${session.app_id}`;

    return adapters
      .filter((adapter: AppRuntimeActivationInput['manifest']['adapters'][number]) =>
        adapter.name === 'telegram')
      .map(() => ({
        connectorId: `connector:telegram:${accountId}`,
        accountId,
        mode: clientCredentialsPresent ? 'full_client' : 'connector',
      }));
  }

  private async registerConnectorsForSession(
    input: AppRuntimeActivationInput,
    session: AppRuntimeSession,
  ): Promise<void> {
    if (!this.options.communicationGatewayService) {
      return;
    }

    const connectors = this.buildConnectorRegistrations(input, session);
    if (connectors.length === 0) {
      return;
    }

    for (const connector of connectors) {
      await this.options.communicationGatewayService.registerConnector({
        connector_id: connector.connectorId,
        kind: 'telegram',
        account_id: connector.accountId,
        project_id: session.project_id,
      });
      await this.options.communicationGatewayService.reportConnectorSession({
        connector_id: connector.connectorId,
        status: 'active',
        health: 'healthy',
        last_seen_at: session.started_at,
        metadata: {
          app_id: session.app_id,
          session_id: session.session_id,
          mode: connector.mode,
        },
      });
    }

    this.connectorIdsBySession.set(
      session.session_id,
      connectors.map((connector) => connector.connectorId),
    );
  }

  private async reportConnectorStateForSession(
    sessionId: string,
    input: Omit<CommunicationConnectorSession, 'connector_id'>,
  ): Promise<void> {
    if (!this.options.communicationGatewayService) {
      return;
    }

    for (const connectorId of this.getConnectorIdsForSession(sessionId)) {
      await this.options.communicationGatewayService.reportConnectorSession({
        connector_id: connectorId,
        ...input,
      });
    }
  }

  private async unregisterConnectorsForSession(sessionId: string): Promise<void> {
    if (!this.options.communicationGatewayService) {
      this.connectorIdsBySession.delete(sessionId);
      return;
    }

    for (const connectorId of this.getConnectorIdsForSession(sessionId)) {
      await this.options.communicationGatewayService.unregisterConnector(connectorId);
    }
    this.connectorIdsBySession.delete(sessionId);
  }

  private async invalidateSessionPanelCache(sessionId: string): Promise<void> {
    try {
      await this.panelTranspiler?.invalidateSession(sessionId);
    } catch {
      // Route resolution already fails closed without an active session, so cache deletion
      // failures must not block lifecycle cleanup.
    }
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
