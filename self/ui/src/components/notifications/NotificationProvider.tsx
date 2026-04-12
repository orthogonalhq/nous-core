/**
 * NotificationProvider — Shared React context providing badge count
 * via useInboxBadge so sidebar wrappers share a single tRPC query
 * and SSE subscription.
 */
import * as React from 'react';
import { useInboxBadge } from './inbox/useInboxBadge';
import { useShellContext } from '../shell/ShellContext';

interface NotificationContextValue {
  badgeCount: number;
}

const NotificationContext = React.createContext<NotificationContextValue>({ badgeCount: 0 });

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { activeProjectId } = useShellContext();
  const badgeCount = useInboxBadge(activeProjectId);

  const value = React.useMemo(
    () => ({ badgeCount }),
    [badgeCount],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * useNotificationBadge — Consume badge count from NotificationProvider.
 * Falls back to 0 if used outside the provider tree.
 */
export function useNotificationBadge(): number {
  const context = React.useContext(NotificationContext);
  return context.badgeCount;
}
