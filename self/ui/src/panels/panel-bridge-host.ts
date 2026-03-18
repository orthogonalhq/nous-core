import {
  PANEL_BRIDGE_PROTOCOL_VERSION,
  type PanelBridgeConfigSnapshot,
  type PanelBridgeErrorCode,
  PanelBridgePanelMessageSchema,
  type PanelBridgeThemeSnapshot,
  type PanelBridgeNotification,
  PanelBridgeToolTransportRequestSchema,
  PanelBridgeToolTransportResponseSchema,
} from '@nous/shared';

export interface PanelBridgeHostOptions {
  appId: string;
  panelId: string;
  iframe: HTMLIFrameElement;
  mcpEndpoint: string;
  configSnapshot: PanelBridgeConfigSnapshot;
  notifyAdapter?: (notification: PanelBridgeNotification) => Promise<boolean> | boolean;
}

export class PanelBridgeHost {
  private readonly mediaQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  private readonly handleMessage = (event: MessageEvent) => {
    if (event.source !== this.options.iframe.contentWindow) {
      return;
    }

    const parsed = PanelBridgePanelMessageSchema.safeParse(event.data);
    if (!parsed.success) {
      this.postError({
        code: 'message_invalid',
        message: 'Invalid panel bridge message.',
      });
      return;
    }

    const message = parsed.data;
    if (message.protocol !== PANEL_BRIDGE_PROTOCOL_VERSION) {
      this.postError({
        code: 'protocol_unsupported',
        message: 'Unsupported panel bridge protocol version.',
      });
      return;
    }

    if ('app_id' in message && message.app_id !== this.options.appId) {
      this.postError({
        code: 'message_invalid',
        message: 'Panel bridge app identity mismatch.',
        requestId: 'request_id' in message ? message.request_id : undefined,
      });
      return;
    }

    if ('panel_id' in message && message.panel_id !== this.options.panelId) {
      this.postError({
        code: 'message_invalid',
        message: 'Panel bridge panel identity mismatch.',
        requestId: 'request_id' in message ? message.request_id : undefined,
      });
      return;
    }

    void this.dispatch(message);
  };

  private readonly handleThemeChange = () => {
    this.postToPanel({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'theme.changed',
      theme: this.buildThemeSnapshot(),
    });
  };

  constructor(private readonly options: PanelBridgeHostOptions) {
    window.addEventListener('message', this.handleMessage);
    this.mediaQuery?.addEventListener?.('change', this.handleThemeChange);
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.mediaQuery?.removeEventListener?.('change', this.handleThemeChange);
  }

  private async dispatch(message: ReturnType<typeof PanelBridgePanelMessageSchema.parse>) {
    switch (message.kind) {
      case 'panel.ready':
        this.postToPanel({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'host.bootstrap',
          message_id: message.message_id,
          config: this.options.configSnapshot,
          theme: this.buildThemeSnapshot(),
          capabilities: {
            tool: true,
            config: true,
            theme: true,
            notify: true,
          },
        });
        return;
      case 'config.get':
        this.postToPanel({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'config.result',
          request_id: message.request_id,
          config: this.options.configSnapshot,
        });
        return;
      case 'theme.get':
        this.postToPanel({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'theme.result',
          request_id: message.request_id,
          theme: this.buildThemeSnapshot(),
        });
        return;
      case 'notify.send':
        await this.handleNotify(message.request_id, message.notification);
        return;
      case 'tool.invoke':
        await this.handleToolInvoke(message);
        return;
    }
  }

  private async handleNotify(
    requestId: string,
    notification: PanelBridgeNotification,
  ): Promise<void> {
    try {
      const accepted =
        (await this.options.notifyAdapter?.(notification)) ??
        this.dispatchLocalNotification(notification);
      this.postToPanel({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        kind: 'notify.result',
        request_id: requestId,
        accepted,
      });
    } catch {
      this.postError({
        code: 'notify_unavailable',
        message: 'Host notification adapter is unavailable.',
        requestId,
      });
    }
  }

  private async handleToolInvoke(
    message: Extract<
      ReturnType<typeof PanelBridgePanelMessageSchema.parse>,
      { kind: 'tool.invoke' }
    >,
  ): Promise<void> {
    try {
      const response = await fetch(this.options.mcpEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nous-panel-bridge': '1',
        },
        body: JSON.stringify(
          PanelBridgeToolTransportRequestSchema.parse({
            protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
            request_id: message.request_id,
            app_id: message.app_id,
            panel_id: message.panel_id,
            tool_name: message.tool_name,
            params: message.params,
          }),
        ),
      });

      const body = await response.json();
      const parsed = PanelBridgeToolTransportResponseSchema.safeParse(body);
      if (!parsed.success) {
        this.postError({
          code: 'internal_error',
          message: 'Invalid MCP bridge response.',
          requestId: message.request_id,
        });
        return;
      }

      if (parsed.data.ok) {
        this.postToPanel({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'tool.result',
          request_id: parsed.data.request_id,
          result: parsed.data.result,
        });
        return;
      }

      this.postError({
        ...parsed.data.error,
        requestId: parsed.data.request_id,
      });
    } catch {
      this.postError({
        code: 'tool_execution_failed',
        message: 'Panel tool invocation failed.',
        requestId: message.request_id,
      });
    }
  }

  private buildThemeSnapshot(): PanelBridgeThemeSnapshot {
    const styles = window.getComputedStyle(document.documentElement);
    const mode =
      document.documentElement.dataset['theme'] === 'light' ||
      document.documentElement.classList.contains('theme-light')
        ? 'light'
        : 'dark';

    return {
      mode,
      tokens: {
        background: styles.getPropertyValue('--nous-bg').trim(),
        surface: styles.getPropertyValue('--nous-surface').trim(),
        foreground: styles.getPropertyValue('--nous-fg').trim(),
        subtle: styles.getPropertyValue('--nous-fg-subtle').trim(),
      },
      metadata: {},
    };
  }

  private dispatchLocalNotification(notification: PanelBridgeNotification): boolean {
    window.dispatchEvent(
      new CustomEvent('nous:panel-notify', {
        detail: notification,
      }),
    );
    return true;
  }

  private postError(input: {
    code: PanelBridgeErrorCode;
    message: string;
    requestId?: string;
  }): void {
    this.postToPanel({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'error',
      request_id: input.requestId,
      error: {
        code: input.code,
        message: input.message,
        retryable: false,
      },
    });
  }

  private postToPanel(message: unknown): void {
    this.options.iframe.contentWindow?.postMessage(message, '*');
  }
}
