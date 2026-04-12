/**
 * useInboxData — Hook wrapping tRPC notification queries with SSE-driven
 * cache invalidation and optimistic updates for acknowledge/dismiss.
 */
import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import type { NotificationRecord, NotificationKind } from '@nous/shared';
import { trpc, useEventSubscription } from '@nous/transport';

const DEFAULT_LIMIT = 50;

export interface UseInboxDataResult {
  notifications: NotificationRecord[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  acknowledge: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  activeCount: number;
  kindFilter: NotificationKind | undefined;
  setKindFilter: (kind: NotificationKind | undefined) => void;
}

export function useInboxData(projectId?: string | null): UseInboxDataResult {
  const utils = trpc.useUtils();
  const [offset, setOffset] = useState(0);
  const [kindFilter, setKindFilter] = useState<NotificationKind | undefined>(undefined);

  // Reset offset when filter changes
  useEffect(() => {
    setOffset(0);
  }, [kindFilter, projectId]);

  const listQuery = trpc.notifications.list.useQuery({
    projectId: projectId ?? undefined,
    kind: kindFilter,
    limit: DEFAULT_LIMIT,
    offset,
  });

  const countQuery = trpc.notifications.countActive.useQuery({
    projectId: projectId ?? undefined,
  });

  const acknowledgeMutation = trpc.notifications.acknowledge.useMutation({
    onMutate: async ({ id }) => {
      // Cancel outgoing refetches
      await utils.notifications.list.cancel();
      await utils.notifications.countActive.cancel();
    },
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.countActive.invalidate();
    },
    onError: () => {
      // Revert on error by refetching
      void utils.notifications.list.invalidate();
      void utils.notifications.countActive.invalidate();
    },
  });

  const dismissMutation = trpc.notifications.dismiss.useMutation({
    onMutate: async ({ id }) => {
      await utils.notifications.list.cancel();
      await utils.notifications.countActive.cancel();
    },
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.countActive.invalidate();
    },
    onError: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.countActive.invalidate();
    },
  });

  // Debounce SSE-triggered invalidation (200ms coalescing)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void utils.notifications.list.invalidate();
      void utils.notifications.countActive.invalidate();
    }, 200);
  }, [utils]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEventSubscription({
    channels: ['notification:raised', 'notification:updated'],
    onEvent: invalidate,
  });

  // Client-side filter: exclude dismissed items (service returns all statuses
  // when status is omitted from the filter)
  const notifications = useMemo(() => {
    const data = (listQuery.data ?? []) as NotificationRecord[];
    return data
      .filter((n) => n.status !== 'dismissed')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [listQuery.data]);

  const hasMore = useMemo(() => {
    const data = listQuery.data ?? [];
    return data.length >= DEFAULT_LIMIT;
  }, [listQuery.data]);

  const loadMore = useCallback(() => {
    if (hasMore && !listQuery.isFetching) {
      setOffset((prev) => prev + DEFAULT_LIMIT);
    }
  }, [hasMore, listQuery.isFetching]);

  const acknowledge = useCallback(
    async (id: string) => {
      await acknowledgeMutation.mutateAsync({ id });
    },
    [acknowledgeMutation],
  );

  const dismiss = useCallback(
    async (id: string) => {
      await dismissMutation.mutateAsync({ id });
    },
    [dismissMutation],
  );

  return {
    notifications,
    isLoading: listQuery.isLoading,
    hasMore,
    loadMore,
    acknowledge,
    dismiss,
    activeCount: countQuery.data ?? 0,
    kindFilter,
    setKindFilter,
  };
}
