import { describe, expect, it } from 'vitest';
import {
  AppActivationHandshakeSchema,
  AppPanelBridgeContextSchema,
  AppPanelLifecycleUpdateSchema,
  AppPanelSafeConfigSnapshotSchema,
  AppPanelPersistedStateResultSchema,
  AppConnectorEgressIntentSchema,
  AppConnectorIngressIntentSchema,
  AppConnectorSessionReportSchema,
  AppHeartbeatSignalSchema,
  AppLaunchSpecSchema,
  AppOutboundToolCallContextSchema,
  AppRuntimeActivationInputSchema,
  AppRuntimeSessionSchema,
  AppToolRegistrationRecordSchema,
} from '../../types/app-runtime.js';

describe('AppLaunchSpecSchema', () => {
  it('accepts deterministic launch specs with deny flags enforced', () => {
    const result = AppLaunchSpecSchema.safeParse({
      app_id: 'app:weather',
      package_id: 'app:weather',
      package_version: '1.0.0',
      manifest_version: '1',
      entrypoint: 'main.ts',
      working_directory: '/tmp/weather',
      deno_args: ['run', '--deny-env', '--deny-run', '--deny-ffi', 'main.ts'],
      compiled_permissions: {
        allow_read: ['/tmp/weather', '/tmp/weather/data'],
        allow_write: ['/tmp/weather/data'],
        allow_net: ['api.example.com'],
        deny_env: true,
        deny_run: true,
        deny_ffi: true,
        cached_only: true,
      },
      app_data_dir: '/tmp/weather/data',
      config_version: 'cfg-1',
    });

    expect(result.success).toBe(true);
  });
});

describe('AppActivationHandshakeSchema', () => {
  it('requires read-only config entries', () => {
    const result = AppActivationHandshakeSchema.safeParse({
      session_id: 'session-1',
      app_id: 'app:weather',
      package_id: 'app:weather',
      package_version: '1.0.0',
      allowed_outbound_tools: ['health_report'],
      config: [
        {
          key: 'city',
          value: 'Seattle',
          source: 'project_config',
          mutable: false,
        },
      ],
      permissions: {
        allow_read: ['/tmp/weather'],
        allow_write: ['/tmp/weather/data'],
        allow_net: ['api.example.com'],
        deny_env: true,
        deny_run: true,
        deny_ffi: true,
        cached_only: true,
      },
      panels: [],
      heartbeat_interval_ms: 5000,
    });

    expect(result.success).toBe(true);
  });
});

describe('AppPanel bridge runtime schemas', () => {
  it('accepts panel-safe config snapshots and bridge contexts', () => {
    const snapshot = AppPanelSafeConfigSnapshotSchema.parse({
      units: {
        value: 'metric',
        source: 'project_config',
      },
    });
    const context = AppPanelBridgeContextSchema.parse({
      session_id: 'session-1',
      app_id: 'app:weather',
      package_id: 'app:weather',
      package_version: '1.0.0',
      panel_id: 'forecast',
      label: 'Forecast',
      entry: 'panels/forecast.tsx',
      preserve_state: true,
      package_root_ref: '/tmp/.apps/weather',
      manifest_ref: '/tmp/.apps/weather/manifest.json',
      route_path: '/apps/app%3Aweather/panels/forecast',
      dockview_panel_id: 'app:app:weather:forecast',
      config_snapshot: snapshot,
      lifecycle: {
        event: 'panel_mount',
        reason: 'open',
        updated_at: '2026-03-18T00:00:00.000Z',
      },
    });

    expect(context.config_snapshot.units?.value).toBe('metric');
    expect(context.lifecycle?.event).toBe('panel_mount');
  });
});

describe('App panel lifecycle and persisted-state schemas', () => {
  it('accepts canonical lifecycle updates', () => {
    const result = AppPanelLifecycleUpdateSchema.safeParse({
      app_id: 'app:weather',
      panel_id: 'forecast',
      event: 'panel_mount',
      reason: 'activate',
      occurred_at: '2026-03-18T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('accepts persisted-state results with and without a stored value', () => {
    const hit = AppPanelPersistedStateResultSchema.safeParse({
      app_id: 'app:weather',
      panel_id: 'forecast',
      key: 'filters',
      exists: true,
      value: {
        city: 'Seattle',
      },
      updated_at: '2026-03-18T00:00:00.000Z',
    });
    const miss = AppPanelPersistedStateResultSchema.safeParse({
      app_id: 'app:weather',
      panel_id: 'forecast',
      key: 'filters',
      exists: false,
      updated_at: '2026-03-18T00:00:00.000Z',
    });

    expect(hit.success).toBe(true);
    expect(miss.success).toBe(true);
  });
});

describe('AppRuntimeSessionSchema', () => {
  it('accepts runtime sessions with health metadata', () => {
    const result = AppRuntimeSessionSchema.safeParse({
      session_id: 'session-1',
      app_id: 'app:weather',
      package_id: 'app:weather',
      package_version: '1.0.0',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      pid: 1234,
      status: 'active',
      started_at: '2026-03-17T00:00:00.000Z',
      registered_tool_ids: ['app:weather.get_forecast'],
      panel_ids: ['weather.main'],
      health_status: 'healthy',
      last_heartbeat_at: '2026-03-17T00:00:10.000Z',
      config_version: 'cfg-1',
    });

    expect(result.success).toBe(true);
  });
});

describe('AppOutboundToolCallContextSchema', () => {
  it('accepts app caller context with explicit project scope', () => {
    const result = AppOutboundToolCallContextSchema.safeParse({
      caller_type: 'app',
      app_id: 'app:weather',
      package_id: 'app:weather',
      session_id: 'session-1',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      tool_id: 'memory_write',
      request_id: 'req-1',
    });

    expect(result.success).toBe(true);
  });
});

describe('AppToolRegistrationRecordSchema', () => {
  it('accepts namespaced tool registration records', () => {
    const result = AppToolRegistrationRecordSchema.safeParse({
      app_id: 'app:weather',
      session_id: 'session-1',
      tool_name: 'get_forecast',
      namespaced_tool_id: 'app:weather.get_forecast',
      description: 'Fetch the current forecast.',
      input_schema: {
        type: 'object',
      },
      registration_witness_ref: 'evt-1',
    });

    expect(result.success).toBe(true);
  });
});

describe('AppHeartbeatSignalSchema', () => {
  it('rejects negative heartbeat sequence values', () => {
    const result = AppHeartbeatSignalSchema.safeParse({
      session_id: 'session-1',
      reported_at: '2026-03-17T00:00:10.000Z',
      sequence: -1,
    });

    expect(result.success).toBe(false);
  });
});

describe('Connector runtime bridge schemas', () => {
  it('accepts normalized connector ingress and egress intents', () => {
    const ingress = AppConnectorIngressIntentSchema.safeParse({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:primary',
      envelope: {
        ingress_id: '550e8400-e29b-41d4-a716-446655440210',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:primary',
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
    const egress = AppConnectorEgressIntentSchema.safeParse({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:primary',
      envelope: {
        egress_id: '550e8400-e29b-41d4-a716-446655440211',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:primary',
        conversation_id: 'chat:1',
        thread_id: null,
        recipient_binding_ref: '550e8400-e29b-41d4-a716-446655440212',
        message_class: 'response',
        payload_ref: 'payload:2',
        delivery_policy_ref: 'delivery:default',
        retry_policy_ref: 'retry:default',
        requested_at: '2026-03-17T00:00:01.000Z',
        trace_parent: null,
      },
      requested_by_tool: 'telegram.send_message',
    });

    expect(ingress.success).toBe(true);
    expect(egress.success).toBe(true);
  });

  it('accepts connector session reports with connector and full-client modes', () => {
    const result = AppConnectorSessionReportSchema.safeParse({
      session_id: 'session-1',
      connector_id: 'connector:telegram:account:primary',
      mode: 'full_client',
      health: 'healthy',
      metadata: {
        account_id: 'account:primary',
      },
      reported_at: '2026-03-17T00:00:02.000Z',
    });

    expect(result.success).toBe(true);
  });
});

describe('AppRuntimeActivationInputSchema', () => {
  it('accepts activation input with manifest and handshake configuration', () => {
    const result = AppRuntimeActivationInputSchema.safeParse({
      package_root_ref: '/tmp/.apps/weather',
      manifest_ref: '/tmp/.apps/weather/manifest.json',
      manifest: {
        id: 'app:weather',
        name: 'Weather',
        version: '1.0.0',
        package_type: 'app',
        origin_class: 'nous_first_party',
        display_name: 'Weather',
        description: 'Weather runtime app',
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
        working_directory: '/tmp/.apps/weather',
        deno_args: ['run', '--deny-env', 'main.ts'],
        compiled_permissions: {
          allow_read: ['/tmp/.apps/weather'],
          allow_write: ['/tmp/.apps/weather/data'],
          allow_net: ['api.example.com'],
          deny_env: true,
          deny_run: true,
          deny_ffi: true,
          cached_only: true,
        },
        app_data_dir: '/tmp/.apps/weather/data',
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
    });

    expect(result.success).toBe(true);
  });
});
