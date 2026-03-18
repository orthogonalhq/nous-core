import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  PanelBridgeWindowBootstrapSchema,
  type HostBootstrapMessage,
  type PanelBridgeConfigSnapshot,
} from '@nous/shared';
import { PanelSdkContext } from './panel-context.js';
import { PanelBridgeClient } from './panel-bridge-client.js';

declare global {
  interface Window {
    __NOUS_PANEL_BRIDGE_BOOTSTRAP__?: unknown;
  }
}

function readBootstrap() {
  return PanelBridgeWindowBootstrapSchema.parse(
    window.__NOUS_PANEL_BRIDGE_BOOTSTRAP__,
  );
}

export function NousPanel({ children }: { children: ReactNode }) {
  const [bridgeState, setBridgeState] = useState<{
    client: PanelBridgeClient;
    bootstrap: HostBootstrapMessage;
  } | null>(null);
  const [config, setConfig] = useState<PanelBridgeConfigSnapshot>({});
  const [theme, setTheme] = useState<HostBootstrapMessage['theme']>({
    mode: 'dark',
    tokens: {},
    metadata: {},
  });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribeTheme: (() => void) | undefined;

    try {
      const client = new PanelBridgeClient(readBootstrap());
      void client
        .connect()
        .then((bootstrap) => {
          if (!active) {
            client.destroy();
            return;
          }

          setBridgeState({
            client,
            bootstrap,
          });
          setConfig(bootstrap.config);
          setTheme(bootstrap.theme);
          unsubscribeTheme = client.subscribeTheme((nextTheme) => {
            setTheme(nextTheme);
          });
        })
        .catch((nextError) => {
          if (active) {
            setError(nextError instanceof Error ? nextError : new Error('Panel bridge setup failed.'));
          }
        });

      return () => {
        active = false;
        unsubscribeTheme?.();
        client.destroy();
      };
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error('Invalid panel bridge bootstrap.'));
      return;
    }
  }, []);

  if (error) {
    throw error;
  }

  if (!bridgeState) {
    return null;
  }

  return (
    <PanelSdkContext.Provider
      value={{
        client: bridgeState.client,
        capabilities: bridgeState.bootstrap.capabilities,
        config,
        theme,
        setConfig,
        setTheme,
      }}
    >
      {children}
    </PanelSdkContext.Provider>
  );
}
