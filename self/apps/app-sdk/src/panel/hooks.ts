import { useContext } from 'react';
import type {
  PanelBridgeConfigSnapshot,
  PanelBridgeNotification,
  PanelBridgeThemeSnapshot,
} from '@nous/shared';
import { PanelSdkContext } from './panel-context.js';

function usePanelSdkContext() {
  const context = useContext(PanelSdkContext);
  if (!context) {
    throw new Error('Panel SDK hooks must be used inside <NousPanel>.');
  }

  return context;
}

export function useTool(toolName: string) {
  const context = usePanelSdkContext();
  return async (params?: unknown): Promise<unknown> => {
    return context.client.invokeTool(toolName, params);
  };
}

export function useConfig(): {
  config: PanelBridgeConfigSnapshot;
  refresh: () => Promise<PanelBridgeConfigSnapshot>;
} {
  const context = usePanelSdkContext();
  return {
    config: context.config,
    refresh: async () => {
      const nextConfig = await context.client.readConfig();
      context.setConfig(nextConfig);
      return nextConfig;
    },
  };
}

export function useTheme(): {
  theme: PanelBridgeThemeSnapshot;
  refresh: () => Promise<PanelBridgeThemeSnapshot>;
} {
  const context = usePanelSdkContext();
  return {
    theme: context.theme,
    refresh: async () => {
      const nextTheme = await context.client.readTheme();
      context.setTheme(nextTheme);
      return nextTheme;
    },
  };
}

export function useNotify() {
  const context = usePanelSdkContext();
  return async (notification: PanelBridgeNotification): Promise<boolean> => {
    return context.client.sendNotify(notification);
  };
}
