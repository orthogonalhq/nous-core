import {
  type AppPanelLifecycleEvent,
  type AppPanelLifecycleReason,
  PANEL_BRIDGE_PROTOCOL_VERSION,
  type PanelBridgeConfigSnapshot,
  type PanelBridgeErrorCode,
  PanelBridgeToolTransportFailureSchema,
  PanelBridgePanelMessageSchema,
  PanelPersistedStateTransportResultSchema,
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
  configVersion: string;
  configSnapshot: PanelBridgeConfigSnapshot;
  notifyAdapter?: (notification: PanelBridgeNotification) => Promise<boolean> | boolean;
  lifecycleAdapter?: (input: {
    app_id: string;
    panel_id: string;
    event: AppPanelLifecycleEvent;
    reason: AppPanelLifecycleReason;
    occurred_at: string;
  }) => Promise<void> | void;
}

export class PanelBridgeHost {
  private panelReady = false;
  private lastLifecycleKey?: string;
  private configVersion: string;
  private configSnapshot: PanelBridgeConfigSnapshot;

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
    this.configVersion = options.configVersion;
    this.configSnapshot = options.configSnapshot;
    window.addEventListener('message', this.handleMessage);
    this.mediaQuery?.addEventListener?.('change', this.handleThemeChange);
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.mediaQuery?.removeEventListener?.('change', this.handleThemeChange);
  }

  updateConfig(input: {
    configVersion: string;
    configSnapshot: PanelBridgeConfigSnapshot;
  }): void {
    const changed =
      input.configVersion !== this.configVersion ||
      JSON.stringify(input.configSnapshot) !== JSON.stringify(this.configSnapshot);

    this.configVersion = input.configVersion;
    this.configSnapshot = input.configSnapshot;

    if (!changed || !this.panelReady) {
      return;
    }

    this.postToPanel({
      protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
      kind: 'config.changed',
      config_version: this.configVersion,
      config: this.configSnapshot,
    });
  }

  private async dispatch(message: ReturnType<typeof PanelBridgePanelMessageSchema.parse>) {
    switch (message.kind) {
      case 'panel.ready':
        this.panelReady = true;
        this.postToPanel({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'host.bootstrap',
          message_id: message.message_id,
          config_version: this.configVersion,
          config: this.configSnapshot,
          theme: this.buildThemeSnapshot(),
          capabilities: {
            tool: true,
            config: true,
            theme: true,
            notify: true,
            persisted_state: true,
            lifecycle: true,
          },
        });
        await this.notifyLifecycle('panel_mount', 'open');
        return;
      case 'config.get':
        this.postToPanel({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'config.result',
          request_id: message.request_id,
          config_version: this.configVersion,
          config: this.configSnapshot,
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
      case 'persisted_state.get':
      case 'persisted_state.set':
      case 'persisted_state.delete':
        await this.handlePersistedState(message);
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
      const accepted = (await this.options.notifyAdapter?.(notification)) ?? false;
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

  async notifyLifecycle(
    event: AppPanelLifecycleEvent,
    reason: AppPanelLifecycleReason,
  ): Promise<void> {
    const nextLifecycleKey = `${event}:${reason}`;
    if (this.lastLifecycleKey === nextLifecycleKey) {
      return;
    }

    try {
      await this.options.lifecycleAdapter?.({
        app_id: this.options.appId,
        panel_id: this.options.panelId,
        event,
        reason,
        occurred_at: new Date().toISOString(),
      });

      if (this.panelReady) {
        this.postToPanel({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          kind: 'panel.lifecycle',
          event,
          reason,
        });
      }

      this.lastLifecycleKey = nextLifecycleKey;
    } catch {
      // Lifecycle reconciliation is best-effort and must not break the host bridge.
    }
  }

  private async handlePersistedState(
    message: Extract<
      ReturnType<typeof PanelBridgePanelMessageSchema.parse>,
      | { kind: 'persisted_state.get' }
      | { kind: 'persisted_state.set' }
      | { kind: 'persisted_state.delete' }
    >,
  ): Promise<void> {
    try {
      const response = await fetch(this.options.mcpEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nous-panel-bridge': '1',
          'x-nous-panel-bridge-operation': message.kind,
        },
        body: JSON.stringify({
          protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
          request_id: message.request_id,
          app_id: this.options.appId,
          panel_id: this.options.panelId,
          key: message.key,
          ...('value' in message ? { value: message.value } : {}),
        }),
      });

      const body = await response.json();
      const failure = PanelBridgeToolTransportFailureSchema.safeParse(body);
      if (failure.success) {
        this.postError({
          ...failure.data.error,
          requestId: failure.data.request_id,
        });
        return;
      }

      const parsed = PanelPersistedStateTransportResultSchema.safeParse(body);
      if (!parsed.success) {
        this.postError({
          code: 'internal_error',
          message: 'Invalid persisted-state bridge response.',
          requestId: message.request_id,
        });
        return;
      }

      this.postToPanel({
        protocol: PANEL_BRIDGE_PROTOCOL_VERSION,
        kind: 'persisted_state.result',
        request_id: parsed.data.request_id,
        key: parsed.data.key,
        exists: parsed.data.exists,
        value: parsed.data.value,
      });
    } catch {
      this.postError({
        code: 'host_unavailable',
        message: 'Persisted state bridge is unavailable.',
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
