import { describe, expect, it } from 'vitest';
import {
  PANEL_BRIDGE_PROTOCOL_VERSION,
  PanelBridgeHostMessageSchema,
  PanelBridgePanelMessageSchema,
  PanelBridgeToolTransportRequestSchema,
  PanelBridgeToolTransportResponseSchema,
  PanelBridgeWindowBootstrapSchema,
} from '../../types/panel-bridge-protocol.js';

describe('panel bridge shared protocol types', () => {
  it('parses panel bootstrap, ready, and host bootstrap messages', () => {
    const bootstrap = PanelBridgeWindowBootstrapSchema.parse({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      app_id: 'app:weather',
      panel_id: 'forecast',
      mcp_endpoint: 'http://localhost:3000/mcp',
    });
    const ready = PanelBridgePanelMessageSchema.parse({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'panel.ready',
      message_id: 'msg-1',
      app_id: bootstrap.app_id,
      panel_id: bootstrap.panel_id,
    });
    const hostBootstrap = PanelBridgeHostMessageSchema.parse({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'host.bootstrap',
      message_id: 'msg-1',
      config: {
        units: {
          value: 'metric',
          source: 'project_config',
        },
      },
      theme: {
        mode: 'dark',
        tokens: {
          background: '#000',
          foreground: '#fff',
        },
        metadata: {},
      },
      capabilities: {
        tool: true,
        config: true,
        theme: true,
        notify: true,
      },
    });

    expect(ready.kind).toBe('panel.ready');
    expect(hostBootstrap.kind).toBe('host.bootstrap');
  });

  it('rejects unsupported protocol versions', () => {
    const result = PanelBridgePanelMessageSchema.safeParse({
      protocol: 2,
      kind: 'panel.ready',
      message_id: 'msg-1',
      app_id: 'app:weather',
      panel_id: 'forecast',
    });

    expect(result.success).toBe(false);
  });

  it('parses internal MCP transport requests and typed failures', () => {
    const request = PanelBridgeToolTransportRequestSchema.parse({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      request_id: 'req-1',
      app_id: 'app:weather',
      panel_id: 'forecast',
      tool_name: 'get_forecast',
      params: {
        city: 'Seattle',
      },
    });
    const failure = PanelBridgeToolTransportResponseSchema.parse({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      request_id: request.request_id,
      ok: false,
      error: {
        code: 'tool_execution_failed',
        message: 'Panel tool invocation failed.',
        retryable: false,
      },
    });

    expect(request.tool_name).toBe('get_forecast');
    expect(failure.ok).toBe(false);
  });
});
