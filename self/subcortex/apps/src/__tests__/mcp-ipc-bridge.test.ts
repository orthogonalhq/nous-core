import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('parses connector ingress, egress, and session-report payloads', () => {
    const bridge = new McpIpcBridge();

    const ingress = bridge.parseConnectorIngressIntent({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:telegram',
      envelope: {
        ingress_id: '550e8400-e29b-41d4-a716-446655440920',
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
    const egress = bridge.parseConnectorEgressIntent({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:telegram',
      envelope: {
        egress_id: '550e8400-e29b-41d4-a716-446655440921',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:telegram',
        conversation_id: 'chat:1',
        thread_id: null,
        recipient_binding_ref: '550e8400-e29b-41d4-a716-446655440922',
        message_class: 'response',
        payload_ref: 'hello',
        delivery_policy_ref: 'delivery:default',
        retry_policy_ref: 'retry:default',
        requested_at: '2026-03-17T00:00:01.000Z',
        trace_parent: null,
      },
      requested_by_tool: 'telegram.send_message',
    });
    const report = bridge.parseConnectorSessionReport({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:telegram',
      mode: 'connector',
      health: 'healthy',
      metadata: {
        account_id: 'account:telegram',
      },
      reported_at: '2026-03-17T00:00:02.000Z',
    });

    expect(ingress.source).toBe('telegram_poller');
    expect(egress.requested_by_tool).toBe('telegram.send_message');
    expect(report.mode).toBe('connector');
  });

  it('persists panel state to the app-scoped storage path across bridge instances', async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), `nous-panel-state-${randomUUID()}-`));
    const firstBridge = new McpIpcBridge();
    firstBridge.registerSessionStorage('session-1', appDataDir);

    await firstBridge.setPersistedState('session-1', {
      app_id: 'app:weather',
      panel_id: 'forecast',
      key: 'filters',
      value: {
        city: 'Seattle',
      },
    });

    const secondBridge = new McpIpcBridge();
    secondBridge.registerSessionStorage('session-1', appDataDir);
    const hydrated = await secondBridge.getPersistedState('session-1', {
      app_id: 'app:weather',
      panel_id: 'forecast',
      key: 'filters',
    });

    expect(hydrated.exists).toBe(true);
    expect(hydrated.value).toEqual({
      city: 'Seattle',
    });

    await secondBridge.deletePersistedState('session-1', {
      app_id: 'app:weather',
      panel_id: 'forecast',
      key: 'filters',
    });
    const cleared = await secondBridge.getPersistedState('session-1', {
      app_id: 'app:weather',
      panel_id: 'forecast',
      key: 'filters',
    });

    expect(cleared.exists).toBe(false);
    await rm(appDataDir, { recursive: true, force: true });
  });
});
