'use client';

import type { CSSProperties } from 'react';

import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent, Select, Badge } from '@nous/ui';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-4xl)',
  padding: 'var(--nous-space-4xl)',
};

const pageTitleStyle: CSSProperties = {
  fontSize: '24px',
  fontWeight: 'var(--nous-font-weight-semibold)',
};

const mutedTextStyle: CSSProperties = {
  color: 'var(--nous-text-secondary)',
};

const cardListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-xs)',
  fontSize: 'var(--nous-font-size-sm)',
  margin: 0,
  paddingInlineStart: '1.25rem',
};

const healthListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-md)',
};

const healthRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-md)',
};

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
      <div style={{ padding: 'var(--nous-space-4xl)' }}>
        <p style={mutedTextStyle}>Loading configuration...</p>
      </div>
    );
  }

  const cfg = config as {
    pfcTier?: number;
    modelRoleAssignments?: Array<{ role: string; providerId: string }>;
    providers?: Array<{ id: string; name: string }>;
  };

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Configuration</h1>

      <Card>
        <CardHeader>
          <CardTitle>Cortex Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={String(cfg.pfcTier ?? 3)}
            onChange={handlePfcTierChange}
            style={{ width: '12rem' }}
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
            <p style={mutedTextStyle}>No assignments configured.</p>
          ) : (
            <ul style={cardListStyle}>
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
            <p style={mutedTextStyle}>Checking...</p>
          ) : (
            <div style={healthListStyle}>
              {health.components.map((c) => (
                <div key={c.name} style={healthRowStyle}>
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
                    <span
                      style={{
                        color: 'var(--nous-text-secondary)',
                        fontSize: 'var(--nous-font-size-sm)',
                      }}
                    >
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
