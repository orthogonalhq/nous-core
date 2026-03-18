import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PANEL_BRIDGE_PROTOCOL_VERSION } from '@nous/shared';
import { NousPanel } from '../panel/NousPanel.js';
import {
  useConfig,
  useNotify,
  useTheme,
  useTool,
} from '../panel/hooks.js';

declare global {
  interface Window {
    __NOUS_PANEL_BRIDGE_BOOTSTRAP__?: unknown;
  }
}

function installMockParent() {
  const parentWindow = {
    postMessage: vi.fn((message: {
      kind: string;
      request_id?: string;
    }) => {
      queueMicrotask(() => {
        switch (message.kind) {
          case 'panel.ready':
            dispatchFromParent({
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
            return;
          case 'tool.invoke':
            dispatchFromParent({
              protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
              kind: 'tool.result',
              request_id: message.request_id!,
              result: {
                forecast: 'sunny',
              },
            });
            return;
          case 'config.get':
            dispatchFromParent({
              protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
              kind: 'config.result',
              request_id: message.request_id!,
              config: {
                units: {
                  value: 'imperial',
                  source: 'project_config',
                },
              },
            });
            return;
          case 'theme.get':
            dispatchFromParent({
              protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
              kind: 'theme.result',
              request_id: message.request_id!,
              theme: {
                mode: 'light',
                tokens: {
                  background: '#fff',
                },
                metadata: {},
              },
            });
            return;
          case 'notify.send':
            dispatchFromParent({
              protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
              kind: 'notify.result',
              request_id: message.request_id!,
              accepted: true,
            });
            return;
        }
      });
    }),
  };

  Object.defineProperty(window, 'parent', {
    value: parentWindow,
    configurable: true,
  });

  return parentWindow;
}

function dispatchFromParent(message: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: message,
    }),
  );
}

describe('@nous/app-sdk panel hooks', () => {
  afterEach(() => {
    delete window.__NOUS_PANEL_BRIDGE_BOOTSTRAP__;
    vi.restoreAllMocks();
  });

  it('exposes tool, config, theme, and notify behavior through the bridge', async () => {
    installMockParent();
    window.__NOUS_PANEL_BRIDGE_BOOTSTRAP__ = {
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      app_id: 'app:weather',
      panel_id: 'forecast',
      mcp_endpoint: 'http://localhost:3000/mcp',
    };

    let latest:
      | {
          invokeTool: ReturnType<typeof useTool>;
          config: ReturnType<typeof useConfig>;
          theme: ReturnType<typeof useTheme>;
          notify: ReturnType<typeof useNotify>;
        }
      | undefined;

    function Harness() {
      const invokeTool = useTool('get_forecast');
      const config = useConfig();
      const theme = useTheme();
      const notify = useNotify();

      useEffect(() => {
        latest = {
          invokeTool,
          config,
          theme,
          notify,
        };
      }, [invokeTool, config, theme, notify]);

      return <div data-testid="units">{String(config.config.units?.value ?? '')}</div>;
    }

    const screen = render(
      <NousPanel>
        <Harness />
      </NousPanel>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('units').textContent).toBe('metric');
      expect(latest).toBeDefined();
    });

    const toolResult = await act(async () => {
      return latest!.invokeTool({
        city: 'Seattle',
      });
    });
    expect(toolResult).toEqual({
      forecast: 'sunny',
    });

    const refreshedConfig = await act(async () => {
      return latest!.config.refresh();
    });
    expect(refreshedConfig.units?.value).toBe('imperial');

    const refreshedTheme = await act(async () => {
      return latest!.theme.refresh();
    });
    expect(refreshedTheme.mode).toBe('light');

    const notifyAccepted = await act(async () => {
      return latest!.notify({
        title: 'Weather updated',
        message: 'Forecast ready',
        level: 'info',
      });
    });
    expect(notifyAccepted).toBe(true);
  });
});
