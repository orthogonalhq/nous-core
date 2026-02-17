'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

export function FirstRunRedirect() {
  const router = useRouter();
  const { data, isLoading } = trpc.firstRun.status.useQuery();

  useEffect(() => {
    if (isLoading || data === undefined) return;
    if (data.complete) {
      router.replace('/chat');
    } else {
      router.replace('/first-run');
    }
  }, [data, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}
