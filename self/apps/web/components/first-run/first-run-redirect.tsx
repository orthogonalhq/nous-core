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
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p style={{ color: 'var(--nous-text-secondary)' }}>Loading...</p>
    </div>
  );
}
