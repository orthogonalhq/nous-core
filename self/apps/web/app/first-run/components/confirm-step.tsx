'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Everything works!</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          You&apos;ve completed the first-run setup. Nous is ready to use.
        </p>
        <Button
          onClick={handleGetStarted}
          disabled={complete.isPending}
        >
          Get started
        </Button>
      </CardContent>
    </Card>
  );
}
