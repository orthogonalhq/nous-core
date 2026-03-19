import {
  type PanelLifecycleChangedMessage,
  PANEL_BRIDGE_PROTOCOL_VERSION,
  type HostBootstrapMessage,
  type PanelBridgeConfigSnapshot,
  type PanelBridgeHostMessage,
  PanelBridgeHostMessageSchema,
  type PanelBridgeNotification,
  type PanelPersistedStateResponse,
  type PanelBridgeThemeSnapshot,
  type PanelBridgeWindowBootstrap,
} from '@nous/shared';

function createRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `panel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toBridgeError(message: PanelBridgeHostMessage): Error {
  if (message.kind !== 'error') {
    return new Error('Unexpected panel bridge response.');
  }

  const error = new Error(message.error.message);
  error.name = message.error.code;
  return error;
}

export class PanelBridgeClient {
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: PanelBridgeHostMessage) => void;
      reject: (error: Error) => void;
      timeoutId: number;
    }
  >();

  private readonly themeListeners = new Set<
    (theme: PanelBridgeThemeSnapshot) => void
  >();
  private readonly lifecycleListeners = new Set<
    (event: PanelLifecycleChangedMessage) => void
  >();

  private handshakeResolver?: (message: HostBootstrapMessage) => void;
  private handshakeRejector?: (error: Error) => void;

  private readonly handleMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) {
      return;
    }

    const parsed = PanelBridgeHostMessageSchema.safeParse(event.data);
    if (!parsed.success) {
      return;
    }

    const message = parsed.data;
    if (message.protocol !== PANEL_BRIDGE_PROTOCOL_VERSION) {
      return;
    }

    if (message.kind === 'host.bootstrap') {
      this.handshakeResolver?.(message);
      this.handshakeResolver = undefined;
      this.handshakeRejector = undefined;
      return;
    }

    if (message.kind === 'theme.changed') {
      for (const listener of this.themeListeners) {
        listener(message.theme);
      }
      return;
    }

    if (message.kind === 'panel.lifecycle') {
      for (const listener of this.lifecycleListeners) {
        listener(message);
      }
      return;
    }

    if ('request_id' in message && message.request_id) {
      const pending = this.pendingRequests.get(message.request_id);
      if (!pending) {
        return;
      }

      window.clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(message.request_id);

      if (message.kind === 'error') {
        pending.reject(toBridgeError(message));
        return;
      }

      pending.resolve(message);
    }
  };

  constructor(private readonly bootstrap: PanelBridgeWindowBootstrap) {}

  async connect(): Promise<HostBootstrapMessage> {
    window.addEventListener('message', this.handleMessage);

    const handshake = new Promise<HostBootstrapMessage>((resolve, reject) => {
      this.handshakeResolver = resolve;
      this.handshakeRejector = reject;
    });

    window.parent.postMessage(
      {
        protocol: this.bootstrap.protocol,
        kind: 'panel.ready',
        message_id: createRequestId(),
        app_id: this.bootstrap.app_id,
        panel_id: this.bootstrap.panel_id,
      },
      '*',
    );

    return handshake;
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.handshakeRejector?.(new Error('Panel bridge host is unavailable.'));
    this.handshakeResolver = undefined;
    this.handshakeRejector = undefined;

    for (const [requestId, pending] of this.pendingRequests.entries()) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Panel bridge request ${requestId} was cancelled.`));
      this.pendingRequests.delete(requestId);
    }
  }

  subscribeTheme(
    listener: (theme: PanelBridgeThemeSnapshot) => void,
  ): () => void {
    this.themeListeners.add(listener);
    return () => {
      this.themeListeners.delete(listener);
    };
  }

  subscribeLifecycle(
    listener: (event: PanelLifecycleChangedMessage) => void,
  ): () => void {
    this.lifecycleListeners.add(listener);
    return () => {
      this.lifecycleListeners.delete(listener);
    };
  }

  async invokeTool(toolName: string, params?: unknown): Promise<unknown> {
    const message = await this.request({
      protocol: this.bootstrap.protocol,
      kind: 'tool.invoke',
      request_id: createRequestId(),
      app_id: this.bootstrap.app_id,
      panel_id: this.bootstrap.panel_id,
      tool_name: toolName,
      params,
    });

    if (message.kind !== 'tool.result') {
      throw new Error('Unexpected tool response.');
    }

    return message.result;
  }

  async readConfig(): Promise<PanelBridgeConfigSnapshot> {
    const message = await this.request({
      protocol: this.bootstrap.protocol,
      kind: 'config.get',
      request_id: createRequestId(),
    });

    if (message.kind !== 'config.result') {
      throw new Error('Unexpected config response.');
    }

    return message.config;
  }

  async readTheme(): Promise<PanelBridgeThemeSnapshot> {
    const message = await this.request({
      protocol: this.bootstrap.protocol,
      kind: 'theme.get',
      request_id: createRequestId(),
    });

    if (message.kind !== 'theme.result') {
      throw new Error('Unexpected theme response.');
    }

    return message.theme;
  }

  async sendNotify(notification: PanelBridgeNotification): Promise<boolean> {
    const message = await this.request({
      protocol: this.bootstrap.protocol,
      kind: 'notify.send',
      request_id: createRequestId(),
      notification,
    });

    if (message.kind !== 'notify.result') {
      throw new Error('Unexpected notify response.');
    }

    return message.accepted;
  }

  async readPersistedState(key: string): Promise<PanelPersistedStateResponse> {
    const message = await this.request({
      protocol: this.bootstrap.protocol,
      kind: 'persisted_state.get',
      request_id: createRequestId(),
      key,
    });

    if (message.kind !== 'persisted_state.result') {
      throw new Error('Unexpected persisted-state response.');
    }

    return message;
  }

  async writePersistedState(
    key: string,
    value: unknown,
  ): Promise<PanelPersistedStateResponse> {
    const message = await this.request({
      protocol: this.bootstrap.protocol,
      kind: 'persisted_state.set',
      request_id: createRequestId(),
      key,
      value,
    });

    if (message.kind !== 'persisted_state.result') {
      throw new Error('Unexpected persisted-state response.');
    }

    return message;
  }

  async deletePersistedState(
    key: string,
  ): Promise<PanelPersistedStateResponse> {
    const message = await this.request({
      protocol: this.bootstrap.protocol,
      kind: 'persisted_state.delete',
      request_id: createRequestId(),
      key,
    });

    if (message.kind !== 'persisted_state.result') {
      throw new Error('Unexpected persisted-state response.');
    }

    return message;
  }

  private request(message: {
    protocol: number;
    kind:
      | 'tool.invoke'
      | 'config.get'
      | 'theme.get'
      | 'notify.send'
      | 'persisted_state.get'
      | 'persisted_state.set'
      | 'persisted_state.delete';
    request_id: string;
    app_id?: string;
    panel_id?: string;
    tool_name?: string;
    params?: unknown;
    notification?: PanelBridgeNotification;
    key?: string;
    value?: unknown;
  }): Promise<PanelBridgeHostMessage> {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingRequests.delete(message.request_id);
        reject(new Error('Panel bridge request timed out.'));
      }, 5_000);

      this.pendingRequests.set(message.request_id, {
        resolve,
        reject,
        timeoutId,
      });

      window.parent.postMessage(message, '*');
    });
  }
}
