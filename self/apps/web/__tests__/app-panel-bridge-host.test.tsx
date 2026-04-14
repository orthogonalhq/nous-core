// @vitest-environment jsdom

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PANEL_BRIDGE_PROTOCOL_VERSION } from '@nous/shared';
import { AppIframePanel } from '@nous/ui/panels';

// Mock tRPC for notifyAdapter wiring
const mockRaiseMutate = vi.fn().mockResolvedValue({ id: 'notif-1' });

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: () => ({
      client: {
        notifications: {
          raise: { mutate: mockRaiseMutate },
        },
      },
    }),
  },
}));

function createPanelApiHarness() {
  const activeListeners = new Set<(event: { isActive: boolean }) => void>();

  return {
    api: {
      setRenderer: vi.fn(),
      onDidActiveChange: (listener: (event: { isActive: boolean }) => void) => {
        activeListeners.add(listener);
        return {
          dispose: () => {
            activeListeners.delete(listener);
          },
        };
      },
    },
    emitActive(isActive: boolean) {
      for (const listener of activeListeners) {
        listener({ isActive });
      }
    },
  };
}

describe('AppIframePanel host bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('boots the trusted host bridge, emits lifecycle, and routes tool calls through the MCP endpoint', async () => {
    const panelHarness = createPanelApiHarness();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        request_id: 'req-1',
        ok: true,
        result: {
          forecast: 'rain',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const view = render(
      <AppIframePanel
        {...({
          api: panelHarness.api,
          params: {
            appId: 'app:weather',
            panelId: 'forecast',
            src: 'http://localhost:3000/apps/app%3Aweather/panels/forecast',
            configVersion: 'cfg-1',
            configSnapshot: {
              units: {
                value: 'metric',
                source: 'project_config',
              },
            },
          },
        } as any)}
      />,
    );

    const iframe = view.container.querySelector('iframe');
    expect(iframe).not.toBeNull();

    const postMessageSpy = vi.spyOn(iframe!.contentWindow!, 'postMessage');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe!.contentWindow,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'panel.ready',
          message_id: 'msg-1',
          app_id: 'app:weather',
          panel_id: 'forecast',
        },
      }),
    );

    await waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'host.bootstrap',
        }),
        '*',
      );
    });
    expect(panelHarness.api.setRenderer).toHaveBeenCalledWith('always');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe!.contentWindow,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'tool.invoke',
          request_id: 'req-1',
          app_id: 'app:weather',
          panel_id: 'forecast',
          tool_name: 'get_forecast',
          params: {
            city: 'Seattle',
          },
        },
      }),
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-nous-panel-bridge': '1',
          }),
        }),
      );
    });

    panelHarness.emitActive(false);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/mcp',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-nous-panel-bridge-operation': 'panel.lifecycle',
          }),
        }),
      );
    });
  });

  it('ignores unexpected message sources', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const view = render(
      <AppIframePanel
        {...({
          params: {
            appId: 'app:weather',
            panelId: 'forecast',
            src: 'http://localhost:3000/apps/app%3Aweather/panels/forecast',
            configVersion: 'cfg-1',
            configSnapshot: {},
          },
        } as any)}
      />,
    );

    const iframe = view.container.querySelector('iframe');
    const postMessageSpy = vi.spyOn(iframe!.contentWindow!, 'postMessage');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'tool.invoke',
          request_id: 'req-1',
          app_id: 'app:weather',
          panel_id: 'forecast',
          tool_name: 'get_forecast',
        },
      }),
    );

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('routes persisted-state requests and uses non-preserved renderer semantics', async () => {
    const panelHarness = createPanelApiHarness();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        request_id: 'req-2',
        ok: true,
        key: 'filters',
        exists: true,
        value: {
          city: 'Seattle',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const view = render(
      <AppIframePanel
        {...({
          api: panelHarness.api,
          params: {
            appId: 'app:weather',
            panelId: 'forecast',
            src: 'http://localhost:3000/apps/app%3Aweather/panels/forecast',
            preserveState: false,
            configVersion: 'cfg-1',
            configSnapshot: {},
          },
        } as any)}
      />,
    );

    const iframe = view.container.querySelector('iframe');
    const postMessageSpy = vi.spyOn(iframe!.contentWindow!, 'postMessage');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe!.contentWindow,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'panel.ready',
          message_id: 'msg-2',
          app_id: 'app:weather',
          panel_id: 'forecast',
        },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe!.contentWindow,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'persisted_state.get',
          request_id: 'req-2',
          key: 'filters',
        },
      }),
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/mcp',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-nous-panel-bridge-operation': 'persisted_state.get',
          }),
        }),
      );
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'persisted_state.result',
          key: 'filters',
          exists: true,
        }),
        '*',
      );
    });
    expect(panelHarness.api.setRenderer).toHaveBeenCalledWith('onlyWhenVisible');
  });

  it('emits canonical unmount lifecycle updates on host reload and panel close', async () => {
    const panelHarness = createPanelApiHarness();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        request_id: 'req-3',
        ok: true,
        result: {},
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const view = render(
      <AppIframePanel
        {...({
          api: panelHarness.api,
          params: {
            appId: 'app:weather',
            panelId: 'forecast',
            src: 'http://localhost:3000/apps/app%3Aweather/panels/forecast',
            configVersion: 'cfg-1',
            configSnapshot: {},
          },
        } as any)}
      />,
    );

    const iframe = view.container.querySelector('iframe');
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe!.contentWindow,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'panel.ready',
          message_id: 'msg-3',
          app_id: 'app:weather',
          panel_id: 'forecast',
        },
      }),
    );

    window.dispatchEvent(new Event('beforeunload'));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/mcp',
        expect.objectContaining({
          body: expect.stringContaining('"reason":"host_reload"'),
        }),
      );
    });

    view.unmount();

    expect(fetchSpy).not.toHaveBeenCalledWith(
      'http://localhost:3000/mcp',
      expect.objectContaining({
        body: expect.stringContaining('"reason":"close"'),
      }),
    );
  });

  it('routes notify.send messages through tRPC raise mutation and responds with accepted: true', async () => {
    const panelHarness = createPanelApiHarness();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        request_id: 'req-lifecycle',
        ok: true,
        result: {},
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const view = render(
      <AppIframePanel
        {...({
          api: panelHarness.api,
          params: {
            appId: 'app:weather',
            panelId: 'forecast',
            src: 'http://localhost:3000/apps/app%3Aweather/panels/forecast',
            configVersion: 'cfg-1',
            configSnapshot: {},
          },
        } as any)}
      />,
    );

    const iframe = view.container.querySelector('iframe');
    const postMessageSpy = vi.spyOn(iframe!.contentWindow!, 'postMessage');

    // Boot the bridge
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe!.contentWindow,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'panel.ready',
          message_id: 'msg-notify',
          app_id: 'app:weather',
          panel_id: 'forecast',
        },
      }),
    );

    await waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'host.bootstrap' }),
        '*',
      );
    });

    postMessageSpy.mockClear();

    // Send notify.send message
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe!.contentWindow,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'notify.send',
          request_id: 'req-notify-1',
          app_id: 'app:weather',
          panel_id: 'forecast',
          notification: {
            title: 'Weather alert',
            message: 'Storm approaching',
            level: 'warning',
          },
        },
      }),
    );

    await waitFor(() => {
      expect(mockRaiseMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'panel',
          title: 'Weather alert',
          message: 'Storm approaching',
          transient: true,
          source: 'panel:forecast',
          panel: expect.objectContaining({
            panelId: 'forecast',
            level: 'warning',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'notify.result',
          request_id: 'req-notify-1',
          accepted: true,
        }),
        '*',
      );
    });
  });

  it('pushes config updates to the live iframe without remounting it', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        request_id: 'req-4',
        ok: true,
        result: {},
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const view = render(
      <AppIframePanel
        {...({
          params: {
            appId: 'app:weather',
            panelId: 'forecast',
            src: 'http://localhost:3000/apps/app%3Aweather/panels/forecast',
            configVersion: 'cfg-1',
            configSnapshot: {
              units: {
                value: 'metric',
                source: 'project_config',
              },
            },
          },
        } as any)}
      />,
    );

    const iframe = view.container.querySelector('iframe');
    const postMessageSpy = vi.spyOn(iframe!.contentWindow!, 'postMessage');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe!.contentWindow,
        data: {
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'panel.ready',
          message_id: 'msg-4',
          app_id: 'app:weather',
          panel_id: 'forecast',
        },
      }),
    );

    await waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'host.bootstrap',
        }),
        '*',
      );
    });

    postMessageSpy.mockClear();

    window.dispatchEvent(
      new CustomEvent('nous:app-settings-changed', {
        detail: {
          appId: 'app:weather',
          configVersion: 'cfg-2',
          configSnapshot: {
            units: {
              value: 'imperial',
              source: 'project_config',
            },
          },
        },
      }),
    );

    await waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'config.changed',
          config_version: 'cfg-2',
          config: {
            units: {
              value: 'imperial',
              source: 'project_config',
            },
          },
        }),
        '*',
      );
    });

    expect(view.container.querySelector('iframe')).toBe(iframe);
  });
});
