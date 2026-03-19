import { useContext, useEffect, useRef, useState } from 'react';
import type {
  PanelLifecycleChangedMessage,
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

export function usePersistedState<T>(
  key: string,
  initialValue: T,
): [
  T,
  (value: T | ((current: T) => T)) => Promise<void>,
  {
    hydrated: boolean;
    error: Error | null;
    clear: () => Promise<void>;
  },
] {
  const context = usePanelSdkContext();
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const initialValueRef = useRef(initialValue);
  const committedValueRef = useRef<T>(initialValue);

  useEffect(() => {
    let active = true;
    setHydrated(false);
    setError(null);

    void context.client
      .readPersistedState(key)
      .then((result) => {
        if (!active) {
          return;
        }

        const nextValue = (
          result.exists ? result.value : initialValueRef.current
        ) as T;
        committedValueRef.current = nextValue;
        setValue(nextValue);
        setHydrated(true);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError
            : new Error('Persisted state hydration failed.'),
        );
        setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [context.client, key]);

  const persistValue = async (
    nextValueOrUpdater: T | ((current: T) => T),
  ): Promise<void> => {
    const previousValue = committedValueRef.current;
    const nextValue =
      typeof nextValueOrUpdater === 'function'
        ? (nextValueOrUpdater as (current: T) => T)(previousValue)
        : nextValueOrUpdater;

    setValue(nextValue);
    setError(null);

    try {
      const result = await context.client.writePersistedState(key, nextValue);
      committedValueRef.current = (result.exists ? result.value : nextValue) as T;
      setValue(committedValueRef.current);
    } catch (nextError) {
      committedValueRef.current = previousValue;
      setValue(previousValue);
      const normalizedError =
        nextError instanceof Error
          ? nextError
          : new Error('Persisted state write failed.');
      setError(normalizedError);
      throw normalizedError;
    }
  };

  const clear = async (): Promise<void> => {
    try {
      await context.client.deletePersistedState(key);
      committedValueRef.current = initialValueRef.current;
      setValue(initialValueRef.current);
      setError(null);
    } catch (nextError) {
      const normalizedError =
        nextError instanceof Error
          ? nextError
          : new Error('Persisted state delete failed.');
      setError(normalizedError);
      throw normalizedError;
    }
  };

  return [
    value,
    persistValue,
    {
      hydrated,
      error,
      clear,
    },
  ];
}

function usePanelLifecycleSubscription(
  targetEvent: PanelLifecycleChangedMessage['event'],
  handler: () => void,
): void {
  const context = usePanelSdkContext();

  useEffect(() => {
    return context.client.subscribeLifecycle((event) => {
      if (event.event === targetEvent) {
        handler();
      }
    });
  }, [context.client, handler, targetEvent]);
}

export function onActivate(handler: () => void): void {
  usePanelLifecycleSubscription('panel_mount', handler);
}

export function onDeactivate(handler: () => void): void {
  usePanelLifecycleSubscription('panel_unmount', handler);
}
