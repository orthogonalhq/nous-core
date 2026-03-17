import { describe, expect, it } from 'vitest';
import {
  AppActivationHandshakeSchema,
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
