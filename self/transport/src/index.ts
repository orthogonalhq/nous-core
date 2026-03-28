/**
 * @nous/transport — Unified transport surface for Nous UI.
 *
 * Re-exports a tRPC React client typed against AppRouter, a
 * parameterized useEventSubscription hook, and platform-aware
 * provider/factory helpers.
 */

// tRPC client
export { trpc } from './client';
export type { AppRouter } from './client';

// Provider and factories
export {
  TransportProvider,
  createWebTransport,
  createDesktopTransport,
  useEventsUrl,
} from './provider';
export type { TransportConfig, TransportProviderProps } from './provider';

// Hooks
export { useEventSubscription } from './hooks/useEventSubscription';
export type { UseEventSubscriptionOptions } from './hooks/useEventSubscription';
export { useChatApi } from './hooks/useChatApi';
export type { UseChatApiOptions } from './hooks/useChatApi';
export { usePreferencesApi } from './hooks/usePreferencesApi';
