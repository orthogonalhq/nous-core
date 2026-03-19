import { createContext } from 'react';
import type {
  PanelBridgeCapabilities,
  PanelBridgeConfigSnapshot,
  PanelBridgeThemeSnapshot,
} from '@nous/shared';
import type { Dispatch, SetStateAction } from 'react';
import type { PanelBridgeClient } from './panel-bridge-client.js';

export interface PanelSdkContextValue {
  client: PanelBridgeClient;
  config: PanelBridgeConfigSnapshot;
  theme: PanelBridgeThemeSnapshot;
  capabilities: PanelBridgeCapabilities;
  setConfig: Dispatch<SetStateAction<PanelBridgeConfigSnapshot>>;
  setTheme: Dispatch<SetStateAction<PanelBridgeThemeSnapshot>>;
}

export const PanelSdkContext = createContext<PanelSdkContextValue | null>(null);
