import { describe, expect, it, vi } from 'vitest';
import { AppRuntimeService } from '../app-runtime-service.js';
import { AppToolRegistry } from '../app-tool-registry.js';
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
  panels: [],
} as const;

describe('AppRuntimeService', () => {
  it('activates and then deactivates a runtime session', async () => {
    const lifecycleOrchestrator = {
      run: vi.fn().mockResolvedValue({}),
      disable: vi.fn().mockResolvedValue({}),
    };
    const toolRegistry = new AppToolRegistry({
      register: vi.fn().mockResolvedValue({ witnessRef: 'evt-1' }),
      unregister: vi.fn().mockResolvedValue(undefined),
    });
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
    });

    const session = await service.activate(activationInput as any);
    expect(session.status).toBe('active');
    expect(session.registered_tool_ids).toEqual(['app:weather.get_forecast']);
    expect(lifecycleOrchestrator.run).toHaveBeenCalledTimes(1);

    const stopped = await service.deactivate({
      session_id: 'session-1',
      reason: 'test shutdown',
      disable_package: true,
    });
    expect(stopped?.status).toBe('stopped');
    expect(lifecycleOrchestrator.disable).toHaveBeenCalledTimes(1);
  });

  it('rolls back tool registration when lifecycle run fails', async () => {
    const unregister = vi.fn().mockResolvedValue(undefined);
    const lifecycleOrchestrator = {
      run: vi.fn().mockRejectedValue(new Error('run failed')),
      disable: vi.fn().mockResolvedValue({}),
    };
    const toolRegistry = new AppToolRegistry({
      register: vi.fn().mockResolvedValue({ witnessRef: 'evt-1' }),
      unregister,
    });
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
      toolRegistry: new AppToolRegistry({
        register: vi.fn(),
        unregister: vi.fn(),
      }),
    });

    await expect(service.activate(activationInput as any)).rejects.toThrow('spawn failed');
    expect(await service.listSessions()).toEqual([]);
  });

  it('rolls back tool, panel, and session state when the activation handshake fails', async () => {
    const unregister = vi.fn().mockResolvedValue(undefined);
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
      toolRegistry: new AppToolRegistry({
        register: vi.fn().mockResolvedValue({ witnessRef: 'evt-1' }),
        unregister,
      }),
    });

    await expect(service.activate(activationInput as any)).rejects.toThrow('handshake failed');
    expect(unregister).toHaveBeenCalledWith('app:weather.get_forecast');
    expect(await service.getSession('session-1')).toBeNull();
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
      toolRegistry: new AppToolRegistry({
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
      toolRegistry: new AppToolRegistry({
        register: vi.fn().mockResolvedValue({ witnessRef: 'evt-1' }),
        unregister: vi.fn().mockResolvedValue(undefined),
      }),
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
  });
});
