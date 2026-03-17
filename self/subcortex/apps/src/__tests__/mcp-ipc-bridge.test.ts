import { describe, expect, it, vi } from 'vitest';
import { McpIpcBridge } from '../mcp-ipc-bridge.js';

const session = {
  session_id: 'session-1',
  app_id: 'app:weather',
  package_id: 'app:weather',
  package_version: '1.0.0',
  pid: 123,
  status: 'active',
  started_at: '2026-03-17T00:00:00.000Z',
  registered_tool_ids: [],
  panel_ids: [],
  health_status: 'healthy',
  config_version: 'cfg-1',
} as const;

const activationInput = {
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
  config: [
    {
      key: 'units',
      value: 'metric',
      source: 'project_config',
      mutable: false,
    },
  ],
  allowed_outbound_tools: ['health_report'],
  panels: [],
} as const;

describe('McpIpcBridge', () => {
  it('builds and sends an activation handshake', async () => {
    const sendHandshake = vi.fn();
    const bridge = new McpIpcBridge({ sendHandshake });

    const handshake = await bridge.sendActivationHandshake(session as any, activationInput as any);

    expect(handshake.session_id).toBe('session-1');
    expect(sendHandshake).toHaveBeenCalledWith('session-1', handshake);
  });

  it('requires explicit project_id for project-scoped tool calls', () => {
    const bridge = new McpIpcBridge();

    expect(() =>
      bridge.parseOutboundToolEnvelope({
        context: {
          caller_type: 'app',
          app_id: 'app:weather',
          package_id: 'app:weather',
          session_id: 'session-1',
          tool_id: 'memory_write',
          request_id: 'req-1',
        },
      }),
    ).toThrow('requires explicit project_id');
  });
});
