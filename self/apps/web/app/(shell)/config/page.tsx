'use client';

import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export default function ConfigPage() {
  const { data: config, isLoading } = trpc.config.get.useQuery();
  const { data: health } = trpc.health.check.useQuery();
  const updateConfig = trpc.config.update.useMutation();
  const utils = trpc.useUtils();

  const handlePfcTierChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tier = Number(e.target.value);
    await updateConfig.mutateAsync({ pfcTier: tier });
    utils.config.get.invalidate();
  };

  if (isLoading || !config) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading configuration...</p>
      </div>
    );
  }

  const cfg = config as {
    pfcTier?: number;
    modelRoleAssignments?: Array<{ role: string; providerId: string }>;
    providers?: Array<{ id: string; name: string }>;
  };

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Configuration</h1>

      <Card>
        <CardHeader>
          <CardTitle>Cortex Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={String(cfg.pfcTier ?? 3)}
            onChange={handlePfcTierChange}
            className="w-48"
          >
            {[0, 1, 2, 3, 4, 5].map((t) => (
              <option key={t} value={t}>
                Tier {t}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model Role Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {!cfg.modelRoleAssignments?.length ? (
            <p className="text-muted-foreground">No assignments configured.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {cfg.modelRoleAssignments.map((a, i) => (
                <li key={i}>
                  {a.role} → {a.providerId}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          {!health ? (
            <p className="text-muted-foreground">Checking...</p>
          ) : (
            <div className="space-y-2">
              {health.components.map((c) => (
                <div key={c.name} className="flex items-center gap-2">
                  <Badge
                    variant={
                      c.status === 'healthy'
                        ? 'default'
                        : c.status === 'degraded'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {c.status}
                  </Badge>
                  <span>{c.name}</span>
                  {c.message && (
                    <span className="text-muted-foreground text-sm">
                      {c.message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
