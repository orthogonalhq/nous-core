'use client';

import * as React from 'react';
import type {
  InAppEscalationSurface,
  ProjectConfigurationSnapshot,
} from '@nous/shared';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const MODEL_ROLES = [
  'orchestrator',
  'reasoner',
  'tool-advisor',
  'summarizer',
  'embedder',
  'reranker',
  'vision',
] as const;

const ESCALATION_SURFACES = ['projects', 'chat', 'mao'] as const;

function serializeSurfaces(values: readonly InAppEscalationSurface[]): string {
  return values.join(', ');
}

function parseSurfaces(value: string): InAppEscalationSurface[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(
      (item): item is InAppEscalationSurface =>
        ESCALATION_SURFACES.includes(item as InAppEscalationSurface),
    );
}

interface ProjectConfigurationPanelProps {
  snapshot: ProjectConfigurationSnapshot;
}

export function ProjectConfigurationPanel({
  snapshot,
}: ProjectConfigurationPanelProps) {
  const utils = trpc.useUtils();
  const [message, setMessage] = React.useState<string | null>(null);
  const [type, setType] = React.useState(snapshot.config.type);
  const [pfcTier, setPfcTier] = React.useState(String(snapshot.config.pfcTier));
  const [defaultNodeGovernance, setDefaultNodeGovernance] = React.useState(
    snapshot.config.governanceDefaults.defaultNodeGovernance,
  );
  const [retrievalBudgetTokens, setRetrievalBudgetTokens] = React.useState(
    String(snapshot.config.retrievalBudgetTokens),
  );
  const [memoryCanReadFrom, setMemoryCanReadFrom] = React.useState(
    snapshot.config.memoryAccessPolicy.canReadFrom,
  );
  const [memoryCanBeReadBy, setMemoryCanBeReadBy] = React.useState(
    snapshot.config.memoryAccessPolicy.canBeReadBy,
  );
  const [inheritsGlobal, setInheritsGlobal] = React.useState(
    snapshot.config.memoryAccessPolicy.inheritsGlobal,
  );
  const [modelAssignments, setModelAssignments] = React.useState<Record<string, string>>(
    snapshot.config.modelAssignments ?? {},
  );
  const [lowRoutes, setLowRoutes] = React.useState(
    serializeSurfaces(snapshot.config.escalationPreferences.routeByPriority.low),
  );
  const [mediumRoutes, setMediumRoutes] = React.useState(
    serializeSurfaces(snapshot.config.escalationPreferences.routeByPriority.medium),
  );
  const [highRoutes, setHighRoutes] = React.useState(
    serializeSurfaces(snapshot.config.escalationPreferences.routeByPriority.high),
  );
  const [criticalRoutes, setCriticalRoutes] = React.useState(
    serializeSurfaces(snapshot.config.escalationPreferences.routeByPriority.critical),
  );
  const [mirrorToChat, setMirrorToChat] = React.useState(
    snapshot.config.escalationPreferences.mirrorToChat,
  );
  const firstSchedule = snapshot.schedules[0];
  const [scheduleCron, setScheduleCron] = React.useState(
    firstSchedule?.trigger.kind === 'cron' ? firstSchedule.trigger.cron : '0 * * * *',
  );
  const [scheduleEnabled, setScheduleEnabled] = React.useState(
    firstSchedule?.enabled ?? true,
  );

  React.useEffect(() => {
    React.startTransition(() => {
      setType(snapshot.config.type);
      setPfcTier(String(snapshot.config.pfcTier));
      setDefaultNodeGovernance(snapshot.config.governanceDefaults.defaultNodeGovernance);
      setRetrievalBudgetTokens(String(snapshot.config.retrievalBudgetTokens));
      setMemoryCanReadFrom(snapshot.config.memoryAccessPolicy.canReadFrom);
      setMemoryCanBeReadBy(snapshot.config.memoryAccessPolicy.canBeReadBy);
      setInheritsGlobal(snapshot.config.memoryAccessPolicy.inheritsGlobal);
      setModelAssignments(snapshot.config.modelAssignments ?? {});
      setLowRoutes(
        serializeSurfaces(snapshot.config.escalationPreferences.routeByPriority.low),
      );
      setMediumRoutes(
        serializeSurfaces(snapshot.config.escalationPreferences.routeByPriority.medium),
      );
      setHighRoutes(
        serializeSurfaces(snapshot.config.escalationPreferences.routeByPriority.high),
      );
      setCriticalRoutes(
        serializeSurfaces(snapshot.config.escalationPreferences.routeByPriority.critical),
      );
      setMirrorToChat(snapshot.config.escalationPreferences.mirrorToChat);
      setScheduleCron(
        firstSchedule?.trigger.kind === 'cron'
          ? firstSchedule.trigger.cron
          : '0 * * * *',
      );
      setScheduleEnabled(firstSchedule?.enabled ?? true);
      setMessage(null);
    });
  }, [firstSchedule?.enabled, firstSchedule?.trigger, snapshot]);

  const saveConfiguration = trpc.projects.updateConfiguration.useMutation({
    onSuccess: async () => {
      setMessage('Project configuration saved.');
      await Promise.all([
        utils.projects.configurationSnapshot.invalidate({
          projectId: snapshot.projectId,
        }),
        utils.projects.dashboardSnapshot.invalidate({
          projectId: snapshot.projectId,
        }),
      ]);
    },
    onError: (error) => {
      setMessage(error.message);
    },
  });
  const saveSchedule = trpc.projects.upsertSchedule.useMutation({
    onSuccess: async () => {
      setMessage('Schedule settings saved.');
      await Promise.all([
        utils.projects.configurationSnapshot.invalidate({
          projectId: snapshot.projectId,
        }),
        utils.projects.dashboardSnapshot.invalidate({
          projectId: snapshot.projectId,
        }),
      ]);
    },
    onError: (error) => {
      setMessage(error.message);
    },
  });

  const configBlocked = snapshot.blockedActions.find(
    (action) => action.action === 'edit_project_configuration' && !action.allowed,
  );
  const scheduleBlocked = snapshot.blockedActions.find(
    (action) => action.action === 'update_schedule' && !action.allowed,
  );

  const hasWorkflowDefinition = Boolean(
    snapshot.config.workflow?.defaultWorkflowDefinitionId ??
      snapshot.config.workflow?.definitions[0]?.id,
  );

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Configuration surface</span>
          <Badge variant="outline">{snapshot.config.type}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        {message ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm">
            {message}
          </div>
        ) : null}

        {configBlocked ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            {configBlocked.message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Project type</span>
            <Select
              value={type}
              onChange={(event) =>
                setType(event.target.value as typeof snapshot.config.type)
              }
              disabled={Boolean(configBlocked)}
            >
              <option value="protocol">protocol</option>
              <option value="intent">intent</option>
              <option value="hybrid">hybrid</option>
            </Select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">PFC tier</span>
            <Input
              type="number"
              min={0}
              max={5}
              value={pfcTier}
              onChange={(event) => setPfcTier(event.target.value)}
              disabled={Boolean(configBlocked)}
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Default governance</span>
            <Select
              value={defaultNodeGovernance}
              onChange={(event) =>
                setDefaultNodeGovernance(
                  event.target.value as typeof defaultNodeGovernance,
                )
              }
              disabled={Boolean(configBlocked)}
            >
              <option value="must">must</option>
              <option value="should">should</option>
              <option value="may">may</option>
            </Select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Retrieval budget</span>
            <Input
              type="number"
              min={1}
              value={retrievalBudgetTokens}
              onChange={(event) => setRetrievalBudgetTokens(event.target.value)}
              disabled={Boolean(configBlocked)}
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Model-role assignments</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {MODEL_ROLES.map((role) => (
              <label key={role} className="space-y-2 text-sm">
                <span className="capitalize">{role}</span>
                <Input
                  value={modelAssignments[role] ?? ''}
                  placeholder="provider UUID"
                  onChange={(event) =>
                    setModelAssignments((current) => ({
                      ...current,
                      [role]: event.target.value,
                    }))
                  }
                  disabled={Boolean(configBlocked)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Memory access posture</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Can read from</span>
              <Select
                value={memoryCanReadFrom}
                onChange={(event) =>
                  setMemoryCanReadFrom(
                    event.target.value as typeof memoryCanReadFrom,
                  )
                }
                disabled={Boolean(configBlocked)}
              >
                <option value="all">all</option>
                <option value="none">none</option>
              </Select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Can be read by</span>
              <Select
                value={memoryCanBeReadBy}
                onChange={(event) =>
                  setMemoryCanBeReadBy(
                    event.target.value as typeof memoryCanBeReadBy,
                  )
                }
                disabled={Boolean(configBlocked)}
              >
                <option value="all">all</option>
                <option value="none">none</option>
              </Select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={inheritsGlobal}
              onChange={(event) => setInheritsGlobal(event.target.checked)}
              disabled={Boolean(configBlocked)}
            />
            <span>Inherit global memory posture</span>
          </label>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Escalation preferences</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Low routes</span>
              <Input
                value={lowRoutes}
                onChange={(event) => setLowRoutes(event.target.value)}
                disabled={Boolean(configBlocked)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Medium routes</span>
              <Input
                value={mediumRoutes}
                onChange={(event) => setMediumRoutes(event.target.value)}
                disabled={Boolean(configBlocked)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">High routes</span>
              <Input
                value={highRoutes}
                onChange={(event) => setHighRoutes(event.target.value)}
                disabled={Boolean(configBlocked)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Critical routes</span>
              <Input
                value={criticalRoutes}
                onChange={(event) => setCriticalRoutes(event.target.value)}
                disabled={Boolean(configBlocked)}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mirrorToChat}
              onChange={(event) => setMirrorToChat(event.target.checked)}
              disabled={Boolean(configBlocked)}
            />
            <span>Mirror escalations to chat</span>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Schedule settings</div>
            {scheduleBlocked ? (
              <Badge variant="outline">{scheduleBlocked.reasonCode ?? 'blocked'}</Badge>
            ) : null}
          </div>
          {scheduleBlocked ? (
            <p className="text-sm text-muted-foreground">{scheduleBlocked.message}</p>
          ) : null}
          {hasWorkflowDefinition ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Cron</span>
                <Input
                  value={scheduleCron}
                  onChange={(event) => setScheduleCron(event.target.value)}
                  disabled={Boolean(scheduleBlocked)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(event) => setScheduleEnabled(event.target.checked)}
                  disabled={Boolean(scheduleBlocked)}
                />
                <span>Enabled</span>
              </label>
              <div className="flex items-end">
                <Button
                  disabled={saveSchedule.isPending || Boolean(scheduleBlocked)}
                  onClick={() =>
                    saveSchedule.mutate({
                      id: firstSchedule?.id,
                      projectId: snapshot.projectId,
                      workflowDefinitionId:
                        firstSchedule?.workflowDefinitionId ??
                        snapshot.config.workflow?.defaultWorkflowDefinitionId,
                      workmodeId:
                        firstSchedule?.workmodeId ?? 'system:implementation',
                      trigger: {
                        kind: 'cron',
                        cron: scheduleCron,
                      },
                      enabled: scheduleEnabled,
                      requestedDeliveryMode:
                        firstSchedule?.requestedDeliveryMode ?? 'none',
                    })
                  }
                >
                  Save schedule
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Schedule settings require a canonical workflow definition for this project.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Package-derived defaults</div>
          {!snapshot.config.packageDefaultIntake.length ? (
            <p className="text-sm text-muted-foreground">
              No package-derived defaults are currently recorded for this project.
            </p>
          ) : (
            snapshot.config.packageDefaultIntake.map((entry) => (
              <div
                key={`${entry.sourcePackageId}:${entry.appliedAt}`}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {entry.sourcePackageId} {entry.sourcePackageVersion}
                </div>
                <div className="mt-1 text-muted-foreground">
                  sections: {entry.appliedSections.join(', ')}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Field provenance</div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.fieldProvenance.map((entry) => (
              <div
                key={entry.field}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{entry.field}</span>
                  <Badge variant="outline">{entry.source}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {entry.evidenceRefs[0] ?? 'n/a'}
                  {entry.lockedByPolicy ? ' • locked' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={saveConfiguration.isPending || Boolean(configBlocked)}
            onClick={() =>
              saveConfiguration.mutate({
                projectId: snapshot.projectId,
                expectedUpdatedAt: snapshot.updatedAt,
                updates: {
                  type,
                  pfcTier: Number(pfcTier),
                  governanceDefaults: {
                    ...snapshot.config.governanceDefaults,
                    defaultNodeGovernance,
                  },
                  modelAssignments: Object.fromEntries(
                    Object.entries(modelAssignments).filter(([, value]) => value.trim().length > 0),
                  ),
                  memoryAccessPolicy: {
                    canReadFrom: memoryCanReadFrom,
                    canBeReadBy: memoryCanBeReadBy,
                    inheritsGlobal,
                  },
                  retrievalBudgetTokens: Number(retrievalBudgetTokens),
                  escalationPreferences: {
                    routeByPriority: {
                      low: parseSurfaces(lowRoutes),
                      medium: parseSurfaces(mediumRoutes),
                      high: parseSurfaces(highRoutes),
                      critical: parseSurfaces(criticalRoutes),
                    },
                    acknowledgementSurfaces:
                      snapshot.config.escalationPreferences.acknowledgementSurfaces,
                    mirrorToChat,
                  },
                },
              })
            }
          >
            Save configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
