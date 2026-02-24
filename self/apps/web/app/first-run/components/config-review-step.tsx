'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

interface ConfigReviewStepProps {
  onNext: () => void;
}

export function ConfigReviewStep({ onNext }: ConfigReviewStepProps) {
  const { data: config } = trpc.config.get.useQuery();

  const pfcTier = Number(config?.pfcTier ?? 2);
  const providers = (config?.providers as Array<{ id: string; name: string; modelId: string }>) ?? [];
  const assignments = (config?.modelRoleAssignments as Array<{ role: string; providerId: string }>) ?? [];

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Configuration Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">Cortex Tier</p>
          <p className="text-muted-foreground text-sm">
            {pfcTier} — Controls orchestration strength and reflection depth.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Model Assignments</p>
          <ul className="text-muted-foreground list-inside list-disc text-sm">
            {assignments.map((a) => {
              const prov = providers.find((p) => p.id === a.providerId);
              const name = prov?.name ?? 'Ollama';
              const modelId = String(prov?.modelId ?? 'default');
              return (
                <li key={a.role}>
                  {a.role}: {name} ({modelId})
                </li>
              );
            })}
            {assignments.length === 0 && providers.length > 0 && (
              <li>
                reasoner: {providers[0]?.name} ({String(providers[0]?.modelId ?? 'default')})
              </li>
            )}
          </ul>
        </div>
        <Button type="button" onClick={onNext}>Continue</Button>
      </CardContent>
    </Card>
  );
}
