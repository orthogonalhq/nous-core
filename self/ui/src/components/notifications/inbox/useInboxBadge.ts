/**
 * useInboxBadge — Hook returning a numeric badge count from
 * `notifications.countActive` with SSE-driven invalidation.
 */
import { useCallback, useRef, useEffect } from 'react';
import { trpc, useEventSubscription } from '@nous/transport';

export function useInboxBadge(projectId?: string | null): number {
  const utils = trpc.useUtils();

  const countQuery = trpc.notifications.countActive.useQuery({
    projectId: projectId ?? undefined,
  });

  // Debounce SSE-triggered invalidation (200ms coalescing)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void utils.notifications.countActive.invalidate();
    }, 200);
  }, [utils]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEventSubscription({
    channels: ['notification:raised', 'notification:updated'],
    onEvent: invalidate,
  });

  return countQuery.data ?? 0;
}
