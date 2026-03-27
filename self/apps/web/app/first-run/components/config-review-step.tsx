'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@nous/ui';
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
    <Card style={{ width: '100%', maxWidth: '32rem' }}>
      <CardHeader>
        <CardTitle>Configuration Review</CardTitle>
      </CardHeader>
      <CardContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--nous-space-md)',
        }}
      >
        <div>
          <p
            style={{
              fontSize: 'var(--nous-font-size-sm)',
              fontWeight: 'var(--nous-font-weight-medium)',
            }}
          >
            Cortex Tier
          </p>
          <p
            style={{
              color: 'var(--nous-text-secondary)',
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            {pfcTier} — Controls orchestration strength and reflection depth.
          </p>
        </div>
        <div>
          <p
            style={{
              fontSize: 'var(--nous-font-size-sm)',
              fontWeight: 'var(--nous-font-weight-medium)',
            }}
          >
            Model Assignments
          </p>
          <ul
            style={{
              color: 'var(--nous-text-secondary)',
              fontSize: 'var(--nous-font-size-sm)',
              paddingLeft: '1.25rem',
            }}
          >
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
