'use client';

import * as React from 'react';
import type {
  ConfirmationProof,
  MaoDensityMode,
  MaoGridTileProjection,
  MaoProjectControlAction,
  MaoProjectControlResult,
  ProjectId,
} from '@nous/shared';
import { Badge } from '../badge';
import { Button } from '../button';
import { MaoAuditTrailPanel } from './mao-audit-trail-panel';
import { MaoBacklogPressureCard } from './mao-backlog-pressure-card';
import { MaoDensityGrid } from './mao-density-grid';
import { MaoInspectPanel } from './mao-inspect-panel';
import { MaoProjectControls } from './mao-project-controls';
import { MaoRunGraph } from './mao-run-graph';
import {
  MaoT3ConfirmationDialog,
  T3_ACTIONS,
} from './mao-t3-confirmation-dialog';
import {
  buildMaoReturnHref,
  formatShortId,
  readMaoNavigationContext,
} from './mao-links';
import { trpc, useEventSubscription } from '@nous/transport';
import { useMaoServices } from './mao-services-context';

const DENSITY_MODES: MaoDensityMode[] = ['D0', 'D1', 'D2', 'D3', 'D4'];

interface PendingT3Action {
  action: MaoProjectControlAction;
  reason: string;
  commandId: string;
}

interface InspectTarget {
  agentId: string | null;
  nodeDefinitionId: string | null;
  workflowRunId: string | null;
}

export function MaoOperatingSurface() {
  const {
    Link,
    useProject,
    useSearchParams,
  } = useMaoServices();

  const utils = trpc.useUtils();
  const { projectId, setProjectId } = useProject();
  const searchParams = useSearchParams();

  const linkedProjectId = searchParams.get('projectId');
  const linkedRunId = searchParams.get('runId');
  const linkedNodeId = searchParams.get('nodeId');
  const linkedAgentId = searchParams.get('agentId');
  const linkedEvidenceRef = searchParams.get('evidenceRef');
  const linkedPackageId = searchParams.get('packageId');
  const linkedReleaseId = searchParams.get('releaseId');
  const linkedCandidateId = searchParams.get('candidateId');
  const linkedSource = searchParams.get('source');
  const maoContext = readMaoNavigationContext(searchParams);

  const [densityMode, setDensityMode] = React.useState<MaoDensityMode>('D2');
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(
    linkedRunId,
  );
  const [selectedTarget, setSelectedTarget] = React.useState<InspectTarget>({
    agentId: linkedAgentId,
    nodeDefinitionId: linkedNodeId,
    workflowRunId: linkedRunId,
  });
  const [lastResult, setLastResult] =
    React.useState<MaoProjectControlResult | null>(null);
  const [pendingT3Action, setPendingT3Action] =
    React.useState<PendingT3Action | null>(null);
  const [, startTransition] = React.useTransition();

  const controlMutation = trpc.mao.requestProjectControl.useMutation({
    onSuccess: async (result) => {
      setLastResult(result);
      await Promise.all([
        utils.mao.getProjectSnapshot.invalidate(),
        utils.mao.getAgentInspectProjection.invalidate(),
        utils.mao.getProjectControlProjection.invalidate(),
        utils.mao.getControlAuditHistory.invalidate(),
        utils.health.systemStatus.invalidate(),
        utils.projects.dashboardSnapshot.invalidate(),
        utils.escalations.listProjectQueue.invalidate(),
      ]);
    },
  });

  useEventSubscription({
    channels: [
      'mao:projection-changed',
      'mao:control-action',
      'inference:stream-start',
      'inference:stream-complete',
      'inference:accumulator-snapshot',
    ],
    onEvent: () => {
      void utils.mao.getProjectSnapshot.invalidate();
    },
    enabled: !!projectId,
  });

  React.useEffect(() => {
    if (linkedProjectId && linkedProjectId !== projectId) {
      setProjectId(linkedProjectId);
    }
  }, [linkedProjectId, projectId, setProjectId]);

  const snapshotQuery = trpc.mao.getProjectSnapshot.useQuery(
    {
      projectId: projectId as ProjectId,
      densityMode,
      workflowRunId: selectedRunId ?? undefined,
    },
    {
      enabled: projectId != null,
    },
  );

  const inspectInput =
    projectId != null &&
    (selectedTarget.agentId != null || selectedTarget.nodeDefinitionId != null)
      ? {
          projectId: projectId as ProjectId,
          agentId: selectedTarget.agentId ?? undefined,
          workflowRunId:
            selectedTarget.workflowRunId ??
            selectedRunId ??
            snapshotQuery.data?.workflowRunId ??
            undefined,
          nodeDefinitionId: selectedTarget.nodeDefinitionId ?? undefined,
        }
      : undefined;

  const inspectQuery = trpc.mao.getAgentInspectProjection.useQuery(
    inspectInput as any,
    {
      enabled: inspectInput != null,
    },
  );

  React.useEffect(() => {
    if (!snapshotQuery.data) {
      return;
    }

    const snapshot = snapshotQuery.data;
    const currentSelectionValid =
      selectedTarget.agentId != null &&
      snapshot.grid.some((tile) => tile.agent.agent_id === selectedTarget.agentId);
    const currentNodeValid =
      selectedTarget.nodeDefinitionId != null &&
      snapshot.grid.some(
        (tile) =>
          tile.agent.workflow_node_definition_id === selectedTarget.nodeDefinitionId,
      );

    if (!selectedRunId && snapshot.workflowRunId) {
      setSelectedRunId(snapshot.workflowRunId);
    }

    if (currentSelectionValid || currentNodeValid) {
      return;
    }

    const preferred =
      snapshot.grid.find(
        (tile) =>
          tile.agent.agent_id === linkedAgentId ||
          tile.agent.workflow_node_definition_id === linkedNodeId,
      ) ??
      snapshot.grid.find((tile) => tile.agent.urgency_level === 'urgent') ??
      snapshot.grid[0];

    if (!preferred) {
      return;
    }

    setSelectedTarget({
      agentId: preferred.agent.agent_id,
      nodeDefinitionId: preferred.agent.workflow_node_definition_id ?? null,
      workflowRunId: preferred.agent.workflow_run_id ?? snapshot.workflowRunId ?? null,
    });
  }, [
    linkedAgentId,
    linkedNodeId,
    selectedRunId,
    selectedTarget.agentId,
    selectedTarget.nodeDefinitionId,
    snapshotQuery.data,
  ]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select a project to inspect the MAO operating surface.
        </p>
      </div>
    );
  }

  if (snapshotQuery.isLoading || !snapshotQuery.data) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading MAO operating surface...</p>
      </div>
    );
  }

  const snapshot = snapshotQuery.data;

  const handleSelectTile = (tile: MaoGridTileProjection) => {
    startTransition(() => {
      setSelectedRunId(tile.agent.workflow_run_id ?? snapshot.workflowRunId ?? null);
      setSelectedTarget({
        agentId: tile.agent.agent_id,
        nodeDefinitionId: tile.agent.workflow_node_definition_id ?? null,
        workflowRunId: tile.agent.workflow_run_id ?? snapshot.workflowRunId ?? null,
      });
    });
  };

  const executeControl = (
    action: MaoProjectControlAction,
    reason: string,
    commandId: string,
    confirmationProof?: ConfirmationProof,
  ) => {
    controlMutation.mutate({
      request: {
        command_id: commandId as any,
        project_id: projectId as ProjectId,
        action,
        actor_id: 'principal-operator',
        actor_type: 'operator',
        reason,
        requested_at: new Date().toISOString(),
        impactSummary: {
          activeRunCount: snapshot.workflowRunId ? 1 : 0,
          activeAgentCount: snapshot.summary.activeAgentCount,
          blockedAgentCount: snapshot.summary.blockedAgentCount,
          urgentAgentCount: snapshot.summary.urgentAgentCount,
          affectedScheduleCount: 0,
          evidenceRefs: linkedEvidenceRef ? [linkedEvidenceRef] : [],
        },
      },
      confirmationProof,
    });
  };

  const handleRequestControl = ({
    action,
    reason,
    commandId,
  }: {
    action: MaoProjectControlAction;
    reason: string;
    commandId: string;
  }) => {
    if (T3_ACTIONS.has(action)) {
      setPendingT3Action({ action, reason, commandId });
    } else {
      executeControl(action, reason, commandId);
    }
  };

  const handleT3Confirm = (proof: ConfirmationProof) => {
    if (pendingT3Action) {
      executeControl(
        pendingT3Action.action,
        pendingT3Action.reason,
        pendingT3Action.commandId,
        proof,
      );
    }
    setPendingT3Action(null);
  };

  const handleT3Cancel = () => {
    setPendingT3Action(null);
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">MAO Operating Surface</h1>
          <p className="text-sm text-muted-foreground">
            Inspect density-aware runtime projections, follow evidence-linked
            reasoning previews, and apply governed project-scope controls from
            canonical workflow and opctl truth.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {snapshot.controlProjection.project_control_state}
          </Badge>
          <Badge variant="outline">
            {snapshot.controlProjection.pfc_project_recommendation}
          </Badge>
          {snapshot.workflowRunId ? (
            <Badge variant="outline">
              run {formatShortId(snapshot.workflowRunId)}
            </Badge>
          ) : null}
          {snapshot.diagnostics?.degradedReasonCode ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-500">
              degraded: {snapshot.diagnostics.degradedReasonCode}
            </Badge>
          ) : null}
        </div>
      </div>

      {linkedRunId || linkedNodeId || linkedAgentId || maoContext || linkedSource === 'marketplace' ? (
        <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {maoContext ? 'MAO return context is active.' : 'Linked runtime context is active.'}
          {linkedRunId ? ` run ${formatShortId(linkedRunId)}` : ''}
          {linkedNodeId ? ` node ${formatShortId(linkedNodeId)}` : ''}
          {linkedAgentId ? ` agent ${formatShortId(linkedAgentId)}` : ''}
          {linkedPackageId ? ` package ${linkedPackageId}` : ''}
          {linkedReleaseId ? ` release ${linkedReleaseId}` : ''}
          {linkedCandidateId ? ` candidate ${linkedCandidateId}` : ''}
          {linkedEvidenceRef ? ` evidence ${linkedEvidenceRef}` : ''}
          {maoContext ? (
            <Link
              href={buildMaoReturnHref(maoContext)}
              className="ml-2 underline underline-offset-4"
            >
              Return to MAO root context
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {DENSITY_MODES.map((mode) => (
          <Button
            key={mode}
            variant={densityMode === mode ? 'default' : 'outline'}
            onClick={() => startTransition(() => setDensityMode(mode))}
          >
            {mode}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <MaoDensityGrid
            snapshot={snapshot}
            selectedAgentId={selectedTarget.agentId}
            onSelectTile={handleSelectTile}
          />
          <MaoRunGraph
            graph={snapshot.graph}
            selectedNodeId={selectedTarget.nodeDefinitionId}
            onSelectNode={(next) =>
              startTransition(() => {
                setSelectedRunId(next.workflowRunId ?? snapshot.workflowRunId ?? null);
                setSelectedTarget({
                  agentId: next.agentId ?? null,
                  nodeDefinitionId: next.nodeDefinitionId ?? null,
                  workflowRunId:
                    next.workflowRunId ?? snapshot.workflowRunId ?? null,
                });
              })
            }
          />
        </div>

        <div className="space-y-6">
          <MaoProjectControls
            snapshot={snapshot}
            pending={controlMutation.isPending}
            lastResult={lastResult}
            onRequestControl={handleRequestControl}
          />
          <MaoInspectPanel
            inspect={inspectQuery.data}
            isLoading={inspectQuery.isLoading}
          />
          <MaoAuditTrailPanel projectId={projectId as ProjectId} />
          <MaoBacklogPressureCard />
        </div>
      </div>

      <MaoT3ConfirmationDialog
        open={pendingT3Action !== null}
        action={pendingT3Action?.action ?? 'resume_project'}
        projectId={projectId as ProjectId}
        impactSummary={{
          activeRunCount: snapshot.workflowRunId ? 1 : 0,
          activeAgentCount: snapshot.summary.activeAgentCount,
          blockedAgentCount: snapshot.summary.blockedAgentCount,
          urgentAgentCount: snapshot.summary.urgentAgentCount,
        }}
        onConfirm={handleT3Confirm}
        onCancel={handleT3Cancel}
      />
    </div>
  );
}
