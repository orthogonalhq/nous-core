import { describe, expect, it, vi } from 'vitest';
import { AppRuntimeService } from '../app-runtime-service.js';
import { AppToolRegistry, type AppToolRegistrar } from '../app-tool-registry.js';
import { DenoSpawner } from '../deno-spawner.js';
import { McpIpcBridge } from '../mcp-ipc-bridge.js';

const activationInput = {
  project_id: '550e8400-e29b-41d4-a716-446655440000',
  package_root_ref: '/repo/.apps/weather',
  manifest_ref: '/repo/.apps/weather/manifest.json',
  manifest: {
    id: 'app:weather',
    name: 'weather',
    version: '1.0.0',
    package_type: 'app',
    origin_class: 'nous_first_party',
    api_contract_range: '^1.0.0',
    capabilities: ['tool.execute'],
    permissions: {
      network: ['api.example.com'],
      credentials: false,
      witnessLevel: 'session',
      systemNotify: true,
      memoryContribute: false,
    },
    tools: [
      {
        name: 'get_forecast',
        description: 'Fetch weather',
        inputSchema: {},
        outputSchema: {},
        riskLevel: 'low',
        idempotent: true,
        sideEffects: [],
        memoryRelevance: 'low',
      },
    ],
  },
  launch_spec: {
    app_id: 'app:weather',
    package_id: 'app:weather',
    package_version: '1.0.0',
    project_id: '550e8400-e29b-41d4-a716-446655440000',
    manifest_version: '1',
    entrypoint: 'main.ts',
    working_directory: '/repo/.apps/weather',
    deno_args: ['run', '--deny-env', 'main.ts'],
    compiled_permissions: {
      allow_read: ['/repo/.apps/weather'],
      allow_write: ['/repo/.apps/weather/data'],
      allow_net: ['api.example.com'],
      deny_env: true,
      deny_run: true,
      deny_ffi: true,
      cached_only: true,
    },
    app_data_dir: '/repo/.apps/weather/data',
    config_version: 'cfg-1',
  },
  config: [],
  allowed_outbound_tools: ['health_report'],
  panels: [
    {
      app_id: 'app:weather',
      session_id: 'manifest-session',
      panel_id: 'forecast',
      label: 'Forecast',
      entry: 'panels/forecast.tsx',
      position: 'main',
      preserve_state: true,
    },
  ],
} as const;

const createGatewayService = () => ({
  registerConnector: vi.fn().mockImplementation((input) => ({
    ...input,
    status: 'registered',
    registered_at: '2026-03-17T00:00:00.000Z',
  })),
  reportConnectorSession: vi.fn().mockImplementation((input) => input),
  unregisterConnector: vi.fn(),
  receiveIngress: vi.fn().mockResolvedValue({
    outcome: 'accepted_routed',
    policy: {
      decision_id: '550e8400-e29b-41d4-a716-446655440301',
      ingress_id: '550e8400-e29b-41d4-a716-446655440302',
      connector_authenticated: true,
      account_authorized: true,
      binding_state: 'active',
      mention_policy_allowed: true,
      conversation_policy_allowed: true,
      thread_policy_allowed: true,
      reason_codes: [],
      evidence_refs: [],
      evaluated_at: '2026-03-17T00:00:00.000Z',
    },
    route: {
      route_id: '550e8400-e29b-41d4-a716-446655440303',
      route_kind: 'project_message',
      route_key: 'project:message',
      policy_decision_id: '550e8400-e29b-41d4-a716-446655440301',
      precedence_rank: 0,
      rule_id: 'route:test',
      evidence_refs: [],
      created_at: '2026-03-17T00:00:00.000Z',
    },
  }),
  dispatchEgress: vi.fn().mockResolvedValue({
    outcome: 'delivered',
    attempt: {
      delivery_attempt_id: '550e8400-e29b-41d4-a716-446655440304',
      route_id: '550e8400-e29b-41d4-a716-446655440305',
      egress_id: '550e8400-e29b-41d4-a716-446655440306',
      outcome: 'delivered',
      retry_budget_remaining: 0,
      provider_message_ref: 'telegram:message:1',
      reason_codes: [],
      evidence_refs: [],
      occurred_at: '2026-03-17T00:00:00.000Z',
    },
  }),
});

function createToolRegistry(args: {
  register?: AppToolRegistrar['register'];
  unregister?: AppToolRegistrar['unregister'];
} = {}) {
  return new AppToolRegistry({
    register:
      args.register ?? vi.fn().mockResolvedValue({ witnessRef: 'evt-1' }),
    unregister:
      args.unregister ?? vi.fn().mockResolvedValue(undefined),
  });
}

describe('AppRuntimeService', () => {
  it('activates and then deactivates a runtime session', async () => {
    const lifecycleOrchestrator = {
      run: vi.fn().mockResolvedValue({}),
      disable: vi.fn().mockResolvedValue({}),
    };
    const invalidateSession = vi.fn().mockResolvedValue(undefined);
    const toolRegistry = createToolRegistry();
    const service = new AppRuntimeService({
      lifecycleOrchestrator: lifecycleOrchestrator as any,
      spawner: new DenoSpawner({
        now: () => new Date('2026-03-17T00:00:00.000Z'),
        sessionIdFactory: () => 'session-1',
        spawnProcess: () => ({
          pid: 123,
          kill: vi.fn().mockReturnValue(true),
        }),
      }),
      bridge: new McpIpcBridge({
        sendHandshake: vi.fn(),
      }),
      toolRegistry,
      panelTranspiler: { invalidateSession },
    });

    const session = await service.activate(activationInput as any);
    expect(session.status).toBe('active');
    expect(session.registered_tool_ids).toEqual(['app:weather.get_forecast']);
    expect(await service.resolvePanel('app:weather', 'forecast')).toEqual(
      expect.objectContaining({
        session_id: 'session-1',
        route_path: '/apps/app%3Aweather/panels/forecast',
      }),
    );
    expect(lifecycleOrchestrator.run).toHaveBeenCalledTimes(1);

    const stopped = await service.deactivate({
      session_id: 'session-1',
      reason: 'test shutdown',
      disable_package: true,
    });
    expect(stopped?.status).toBe('stopped');
    expect(lifecycleOrchestrator.disable).toHaveBeenCalledTimes(1);
    expect(await service.resolvePanel('app:weather', 'forecast')).toBeNull();
    expect(invalidateSession).toHaveBeenCalledWith('session-1');
  });

  it('rolls back tool registration when lifecycle run fails', async () => {
    const unregister = vi.fn().mockResolvedValue(undefined);
    const lifecycleOrchestrator = {
      run: vi.fn().mockRejectedValue(new Error('run failed')),
      disable: vi.fn().mockResolvedValue({}),
    };
    const toolRegistry = createToolRegistry({ unregister });
    const service = new AppRuntimeService({
      lifecycleOrchestrator: lifecycleOrchestrator as any,
      spawner: new DenoSpawner({
        sessionIdFactory: () => 'session-1',
        spawnProcess: () => ({
          pid: 123,
          kill: vi.fn().mockReturnValue(true),
        }),
      }),
      bridge: new McpIpcBridge(),
      toolRegistry,
    });

    await expect(service.activate(activationInput as any)).rejects.toThrow('run failed');
    expect(unregister).toHaveBeenCalledWith('app:weather.get_forecast');
  });

  it('rolls back cleanly on spawn failure before session publication', async () => {
    const service = new AppRuntimeService({
      lifecycleOrchestrator: {
        run: vi.fn().mockResolvedValue({}),
        disable: vi.fn().mockResolvedValue({}),
      } as any,
      spawner: new DenoSpawner({
        spawnProcess: () => {
          throw new Error('spawn failed');
        },
      }),
      bridge: new McpIpcBridge(),
      toolRegistry: createToolRegistry({
        register: vi.fn(),
        unregister: vi.fn(),
      }),
    });

    await expect(service.activate(activationInput as any)).rejects.toThrow('spawn failed');
    expect(await service.listSessions()).toEqual([]);
  });

  it('rolls back tool, panel, and session state when the activation handshake fails', async () => {
    const unregister = vi.fn().mockResolvedValue(undefined);
    const invalidateSession = vi.fn().mockResolvedValue(undefined);
    const service = new AppRuntimeService({
      lifecycleOrchestrator: {
        run: vi.fn().mockResolvedValue({}),
        disable: vi.fn().mockResolvedValue({}),
      } as any,
      spawner: new DenoSpawner({
        sessionIdFactory: () => 'session-1',
        spawnProcess: () => ({
          pid: 123,
          kill: vi.fn().mockReturnValue(true),
        }),
      }),
      bridge: new McpIpcBridge({
        sendHandshake: vi.fn().mockRejectedValue(new Error('handshake failed')),
      }),
      toolRegistry: createToolRegistry({ unregister }),
      panelTranspiler: { invalidateSession },
    });

    await expect(service.activate(activationInput as any)).rejects.toThrow('handshake failed');
    expect(unregister).toHaveBeenCalledWith('app:weather.get_forecast');
    expect(await service.getSession('session-1')).toBeNull();
    expect(await service.resolvePanel('app:weather', 'forecast')).toBeNull();
    expect(invalidateSession).toHaveBeenCalledWith('session-1');
  });

  it('rolls back after tool-registration failure', async () => {
    const service = new AppRuntimeService({
      lifecycleOrchestrator: {
        run: vi.fn().mockResolvedValue({}),
        disable: vi.fn().mockResolvedValue({}),
      } as any,
      spawner: new DenoSpawner({
        sessionIdFactory: () => 'session-1',
        spawnProcess: () => ({
          pid: 123,
          kill: vi.fn().mockReturnValue(true),
        }),
      }),
      bridge: new McpIpcBridge(),
      toolRegistry: createToolRegistry({
        register: vi.fn().mockRejectedValue(new Error('registration failed')),
        unregister: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await expect(service.activate(activationInput as any)).rejects.toThrow('registration failed');
    expect(await service.getSession('session-1')).toBeNull();
  });

  it('updates health state from heartbeats and process exits', async () => {
    const service = new AppRuntimeService({
      lifecycleOrchestrator: {
        run: vi.fn().mockResolvedValue({}),
        disable: vi.fn().mockResolvedValue({}),
      } as any,
      spawner: new DenoSpawner({
        sessionIdFactory: () => 'session-1',
        spawnProcess: () => ({
          pid: 123,
          kill: vi.fn().mockReturnValue(true),
        }),
      }),
      bridge: new McpIpcBridge(),
      toolRegistry: createToolRegistry(),
    });

    await service.activate(activationInput as any);
    const snapshot = await service.recordHeartbeat({
      session_id: 'session-1',
      reported_at: '2026-03-17T00:00:05.000Z',
      sequence: 0,
    });
    expect(snapshot.status).toBe('healthy');

    const exited = await service.handleProcessExit({
      session_id: 'session-1',
      code: 1,
      occurred_at: '2026-03-17T00:00:10.000Z',
      reason: 'crash',
    });
    expect(exited?.status).toBe('failed');
    expect(await service.resolvePanel('app:weather', 'forecast')).toBeNull();
  });

  it('registers and cleans up connector sessions with the communication gateway', async () => {
    const gatewayService = createGatewayService();
    const service = new AppRuntimeService({
      lifecycleOrchestrator: {
        run: vi.fn().mockResolvedValue({}),
        disable: vi.fn().mockResolvedValue({}),
      } as any,
      communicationGatewayService: gatewayService as any,
      spawner: new DenoSpawner({
        sessionIdFactory: () => 'session-1',
        spawnProcess: () => ({
          pid: 123,
          kill: vi.fn().mockReturnValue(true),
        }),
      }),
      bridge: new McpIpcBridge(),
      toolRegistry: createToolRegistry(),
    });

    const session = await service.activate({
      ...(activationInput as any),
      manifest: {
        ...(activationInput.manifest as any),
        id: 'telegram',
        adapters: [{ name: 'telegram' }],
      },
      launch_spec: {
        ...(activationInput.launch_spec as any),
        app_id: 'telegram',
        package_id: 'telegram-connector',
      },
      config: [
        {
          key: 'default_account_id',
          value: 'account:telegram',
          source: 'project_config',
          mutable: false,
        },
      ],
    });

    expect(session.status).toBe('active');
    expect(gatewayService.registerConnector).toHaveBeenCalledWith({
      connector_id: 'connector:telegram:account:telegram',
      kind: 'telegram',
      account_id: 'account:telegram',
      project_id: activationInput.project_id,
    });

    await service.deactivate({
      session_id: 'session-1',
      reason: 'test shutdown',
      disable_package: false,
    });
    expect(gatewayService.unregisterConnector).toHaveBeenCalledWith(
      'connector:telegram:account:telegram',
    );
  });

  it('routes connector intents through the host-owned communication gateway', async () => {
    const gatewayService = createGatewayService();
    const service = new AppRuntimeService({
      lifecycleOrchestrator: {
        run: vi.fn().mockResolvedValue({}),
        disable: vi.fn().mockResolvedValue({}),
      } as any,
      communicationGatewayService: gatewayService as any,
      spawner: new DenoSpawner({
        sessionIdFactory: () => 'session-1',
        spawnProcess: () => ({
          pid: 123,
          kill: vi.fn().mockReturnValue(true),
        }),
      }),
      bridge: new McpIpcBridge(),
      toolRegistry: createToolRegistry(),
    });

    await service.activate({
      ...(activationInput as any),
      manifest: {
        ...(activationInput.manifest as any),
        id: 'telegram',
        adapters: [{ name: 'telegram' }],
      },
      launch_spec: {
        ...(activationInput.launch_spec as any),
        app_id: 'telegram',
        package_id: 'telegram-connector',
      },
      config: [
        {
          key: 'default_account_id',
          value: 'account:telegram',
          source: 'project_config',
          mutable: false,
        },
      ],
    });

    await service.submitConnectorIngress({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:telegram',
      envelope: {
        ingress_id: '550e8400-e29b-41d4-a716-446655440307',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:telegram',
        conversation_id: 'chat:1',
        thread_id: null,
        message_id: 'message:1',
        sender_channel_identity: '@principal',
        bound_principal_id: null,
        mention_state: 'direct',
        message_type: 'dm',
        payload_ref: 'payload:1',
        idempotency_key: 'telegram:1',
        occurred_at: '2026-03-17T00:00:00.000Z',
        received_at: '2026-03-17T00:00:01.000Z',
        auth_context_ref: 'auth:1',
        trace_parent: null,
      },
      source: 'telegram_poller',
    });
    await service.dispatchConnectorEgress({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:telegram',
      envelope: {
        egress_id: '550e8400-e29b-41d4-a716-446655440308',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:telegram',
        conversation_id: 'chat:1',
        thread_id: null,
        recipient_binding_ref: '550e8400-e29b-41d4-a716-446655440309',
        message_class: 'response',
        payload_ref: 'hello',
        delivery_policy_ref: 'delivery:default',
        retry_policy_ref: 'retry:default',
        requested_at: '2026-03-17T00:00:02.000Z',
        trace_parent: null,
      },
      requested_by_tool: 'telegram.send_message',
    });
    await service.reportConnectorSession({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:telegram',
      mode: 'connector',
      health: 'healthy',
      metadata: {
        account_id: 'account:telegram',
      },
      reported_at: '2026-03-17T00:00:03.000Z',
    });

    expect(gatewayService.receiveIngress).toHaveBeenCalledTimes(1);
    expect(gatewayService.dispatchEgress).toHaveBeenCalledTimes(1);
    expect(gatewayService.reportConnectorSession).toHaveBeenCalled();
  });

  it('keeps lifecycle cleanup progressing when panel cache invalidation fails during deactivation', async () => {
    const invalidateSession = vi.fn().mockRejectedValue(new Error('cache delete failed'));
    const service = new AppRuntimeService({
      lifecycleOrchestrator: {
        run: vi.fn().mockResolvedValue({}),
        disable: vi.fn().mockResolvedValue({}),
      } as any,
      spawner: new DenoSpawner({
        sessionIdFactory: () => 'session-1',
        spawnProcess: () => ({
          pid: 123,
          kill: vi.fn().mockReturnValue(true),
        }),
      }),
      bridge: new McpIpcBridge(),
      toolRegistry: createToolRegistry(),
      panelTranspiler: { invalidateSession },
    });

    await service.activate(activationInput as any);
    const stopped = await service.deactivate({
      session_id: 'session-1',
      reason: 'test shutdown',
      disable_package: false,
    });

    expect(stopped?.status).toBe('stopped');
    expect(await service.resolvePanel('app:weather', 'forecast')).toBeNull();
    expect(invalidateSession).toHaveBeenCalledWith('session-1');
  });
});
