// @vitest-environment jsdom

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PANEL_BRIDGE_PROTOCOL_VERSION } from '@nous/shared';
import { AppIframePanel } from '@nous/ui/panels';

describe('AppIframePanel host bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('boots the trusted host bridge and routes tool calls through the MCP endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
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
          params: {
            appId: 'app:weather',
            panelId: 'forecast',
            src: 'http://localhost:3000/apps/app%3Aweather/panels/forecast',
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
});
