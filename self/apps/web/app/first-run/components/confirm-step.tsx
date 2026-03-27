'use client';

import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@nous/ui';
import { trpc } from '@/lib/trpc';

export function ConfirmStep() {
  const router = useRouter();
  const complete = trpc.firstRun.complete.useMutation({
    onSuccess: () => {
      router.replace('/chat');
    },
  });

  const handleGetStarted = () => {
    complete.mutate();
  };

  return (
    <Card style={{ width: '100%', maxWidth: '32rem' }}>
      <CardHeader>
        <CardTitle>Everything works!</CardTitle>
      </CardHeader>
      <CardContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--nous-space-md)',
        }}
      >
        <p style={{ color: 'var(--nous-text-secondary)' }}>
          You&apos;ve completed the first-run setup. Nous is ready to use.
        </p>
        <Button
          type="button"
          onClick={handleGetStarted}
          disabled={complete.isPending}
        >
          Get started
        </Button>
      </CardContent>
    </Card>
  );
}
