import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PANEL_BRIDGE_PROTOCOL_VERSION,
  type PanelBridgeHostMessage,
} from '@nous/shared';
import { PanelBridgeClient } from '../panel/panel-bridge-client.js';

function installMockParent() {
  const parentWindow = {
    postMessage: vi.fn(),
  };

  Object.defineProperty(window, 'parent', {
    value: parentWindow,
    configurable: true,
  });

  return parentWindow;
}

function dispatchFromParent(message: PanelBridgeHostMessage) {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: message,
    }),
  );
}

describe('PanelBridgeClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends panel.ready and resolves the host bootstrap handshake', async () => {
    const parentWindow = installMockParent();
    const client = new PanelBridgeClient({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      app_id: 'app:weather',
      panel_id: 'forecast',
      mcp_endpoint: 'http://localhost:3000/mcp',
    });

    const handshake = client.connect();

    expect(parentWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'panel.ready',
        app_id: 'app:weather',
        panel_id: 'forecast',
      }),
      '*',
    );

    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'host.bootstrap',
      message_id: 'msg-1',
      config_version: 'cfg-1',
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
        persisted_state: true,
        lifecycle: true,
      },
    });

    await expect(handshake).resolves.toEqual(
      expect.objectContaining({
        kind: 'host.bootstrap',
      }),
    );
  });

  it('correlates tool requests to tool results', async () => {
    const parentWindow = installMockParent();
    const client = new PanelBridgeClient({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      app_id: 'app:weather',
      panel_id: 'forecast',
      mcp_endpoint: 'http://localhost:3000/mcp',
    });

    const handshake = client.connect();
    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'host.bootstrap',
      message_id: 'msg-1',
      config_version: 'cfg-1',
      config: {},
      theme: {
        mode: 'dark',
        tokens: {},
        metadata: {},
      },
      capabilities: {
        tool: true,
        config: true,
        theme: true,
        notify: true,
        persisted_state: true,
        lifecycle: true,
      },
    });
    await handshake;

    const invokePromise = client.invokeTool('get_forecast', { city: 'Seattle' });
    const toolCall = parentWindow.postMessage.mock.calls.at(-1)?.[0] as {
      request_id: string;
    };

    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'tool.result',
      request_id: toolCall.request_id,
      result: {
        forecast: 'rain',
      },
    });

    await expect(invokePromise).resolves.toEqual({
      forecast: 'rain',
    });
  });

  it('rejects pending requests on teardown cleanup', async () => {
    installMockParent();
    const client = new PanelBridgeClient({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      app_id: 'app:weather',
      panel_id: 'forecast',
      mcp_endpoint: 'http://localhost:3000/mcp',
    });

    const handshake = client.connect();
    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'host.bootstrap',
      message_id: 'msg-1',
      config_version: 'cfg-1',
      config: {},
      theme: {
        mode: 'dark',
        tokens: {},
        metadata: {},
      },
      capabilities: {
        tool: true,
        config: true,
        theme: true,
        notify: true,
        persisted_state: true,
        lifecycle: true,
      },
    });
    await handshake;

    const pending = client.readConfig();
    client.destroy();

    await expect(pending).rejects.toThrow('cancelled');
  });

  it('supports persisted-state requests and lifecycle subscriptions', async () => {
    const parentWindow = installMockParent();
    const client = new PanelBridgeClient({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      app_id: 'app:weather',
      panel_id: 'forecast',
      mcp_endpoint: 'http://localhost:3000/mcp',
    });

    const lifecycleSpy = vi.fn();
    const unsubscribe = client.subscribeLifecycle(lifecycleSpy);
    const handshake = client.connect();
    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'host.bootstrap',
      message_id: 'msg-1',
      config_version: 'cfg-1',
      config: {},
      theme: {
        mode: 'dark',
        tokens: {},
        metadata: {},
      },
      capabilities: {
        tool: true,
        config: true,
        theme: true,
        notify: true,
        persisted_state: true,
        lifecycle: true,
      },
    });
    await handshake;

    const pending = client.readPersistedState('filters');
    const request = parentWindow.postMessage.mock.calls.at(-1)?.[0] as {
      request_id: string;
      key: string;
    };

    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'persisted_state.result',
      request_id: request.request_id,
      key: request.key,
      exists: true,
      value: {
        city: 'Seattle',
      },
    });
    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'panel.lifecycle',
      event: 'panel_mount',
      reason: 'activate',
    });

    await expect(pending).resolves.toEqual(
      expect.objectContaining({
        exists: true,
        value: {
          city: 'Seattle',
        },
      }),
    );
    expect(lifecycleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'panel_mount',
        reason: 'activate',
      }),
    );

    unsubscribe();
  });

  it('notifies config subscribers when the host pushes canonical config updates', async () => {
    installMockParent();
    const client = new PanelBridgeClient({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      app_id: 'app:weather',
      panel_id: 'forecast',
      mcp_endpoint: 'http://localhost:3000/mcp',
    });

    const configSpy = vi.fn();
    const unsubscribe = client.subscribeConfig(configSpy);
    const handshake = client.connect();
    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'host.bootstrap',
      message_id: 'msg-1',
      config_version: 'cfg-1',
      config: {
        units: {
          value: 'metric',
          source: 'project_config',
        },
      },
      theme: {
        mode: 'dark',
        tokens: {},
        metadata: {},
      },
      capabilities: {
        tool: true,
        config: true,
        theme: true,
        notify: true,
        persisted_state: true,
        lifecycle: true,
      },
    });
    await handshake;

    dispatchFromParent({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'config.changed',
      config_version: 'cfg-2',
      config: {
        units: {
          value: 'imperial',
          source: 'project_config',
        },
      },
    });

    expect(configSpy).toHaveBeenCalledWith({
      units: {
        value: 'imperial',
        source: 'project_config',
      },
    });

    unsubscribe();
  });
});
