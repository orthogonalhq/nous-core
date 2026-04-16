'use client';

import * as React from 'react';
import type {
  ConfirmationProof,
  MaoAgentProjection,
  MaoDensityMode,
  MaoGridTileProjection,
  MaoProjectControlAction,
  MaoProjectControlResult,
  ProjectId,
} from '@nous/shared';
import { SYSTEM_SCOPE_SENTINEL_PROJECT_ID } from '@nous/shared';
import { Badge } from '../badge';
import { Button } from '../button';
import { MaoAuditTrailPanel } from './mao-audit-trail-panel';
import { MaoBacklogPressureCard } from './mao-backlog-pressure-card';
import { MaoDensityGrid } from './mao-density-grid';
import { MaoInspectPanel } from './mao-inspect-panel';
import { MaoInspectPopup } from './mao-inspect-popup';
import { MaoLeaseTree } from './mao-lease-tree';
import { MaoProjectControls } from './mao-project-controls';
import { MaoRunGraph } from './mao-run-graph';
import { resolveAgentLabel } from './mao-workflow-group-card';
import { MaoSystemHealthStrip } from './mao-system-health-strip';
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
import { useTabState, type InspectTarget } from './use-tab-state';

const DENSITY_MODES: MaoDensityMode[] = ['D0', 'D1', 'D2', 'D3', 'D4'];

type ActiveTab = 'system' | 'projects';

interface PendingT3Action {
  action: MaoProjectControlAction;
  reason: string;
  commandId: string;
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

  // ---- Tab state ----
  const [activeTab, setActiveTab] = React.useState<ActiveTab>(
    projectId ? 'projects' : 'system',
  );

  // Auto-switch to projects tab when projectId becomes available after mount
  const prevProjectId = React.useRef(projectId);
  React.useEffect(() => {
    if (prevProjectId.current == null && projectId != null) {
      setActiveTab('projects');
    }
    prevProjectId.current = projectId;
  }, [projectId]);

  const systemTab = useTabState('D2');
  const projectsTab = useTabState('D2');

  // Determine active tab state helpers
  const activeTabState = activeTab === 'system' ? systemTab : projectsTab;

  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(
    linkedRunId,
  );
  const [lastResult, setLastResult] =
    React.useState<MaoProjectControlResult | null>(null);
  const [pendingT3Action, setPendingT3Action] =
    React.useState<PendingT3Action | null>(null);
  const [, startTransition] = React.useTransition();

  // ---- Control mutation ----
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
        utils.mao.getSystemSnapshot.invalidate(),
      ]);
    },
  });

  // ---- System tab event subscription ----
  useEventSubscription({
    channels: [
      'mao:projection-changed',
      'mao:control-action',
      'inference:stream-start',
      'inference:stream-complete',
      'inference:accumulator-snapshot',
    ],
    onEvent: () => {
      void utils.mao.getSystemSnapshot.invalidate();
    },
    enabled: activeTab === 'system',
  });

  // ---- Projects tab event subscription ----
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
    enabled: activeTab === 'projects' && !!projectId,
  });

  // ---- Navigation context sync ----
  React.useEffect(() => {
    if (linkedProjectId && linkedProjectId !== projectId) {
      setProjectId(linkedProjectId);
      setActiveTab('projects');
    }
  }, [linkedProjectId, projectId, setProjectId]);

  // ---- System tab query ----
  const systemSnapshotQuery = trpc.mao.getSystemSnapshot.useQuery(
    { densityMode: systemTab.densityMode },
    { enabled: activeTab === 'system' },
  );

  // ---- Projects tab query ----
  const snapshotQuery = trpc.mao.getProjectSnapshot.useQuery(
    {
      projectId: projectId as ProjectId,
      densityMode: projectsTab.densityMode,
      workflowRunId: selectedRunId ?? undefined,
    },
    {
      enabled: activeTab === 'projects' && projectId != null,
    },
  );

  // ---- Inspect popup state ----
  // For the popup, we derive the agent from the active tab's selectedTarget.
  const selectedAgent = React.useMemo<MaoAgentProjection | null>(() => {
    const target = activeTabState.selectedTarget;
    if (!target?.agentId) return null;

    if (activeTab === 'system' && systemSnapshotQuery.data) {
      return (
        systemSnapshotQuery.data.agents.find(
          (a) => a.agent_id === target.agentId,
        ) ?? null
      );
    }

    if (activeTab === 'projects' && snapshotQuery.data) {
      const tile = snapshotQuery.data.grid.find(
        (t) => t.agent.agent_id === target.agentId,
      );
      return tile?.agent ?? null;
    }

    return null;
  }, [activeTab, activeTabState.selectedTarget, systemSnapshotQuery.data, snapshotQuery.data]);

  const popupOpen = selectedAgent != null;

  // B1-e: Build a resolver function that looks up agent ID in the current snapshots
  const resolveAgentLabelFn = React.useCallback(
    (agentId: string): string => {
      if (systemSnapshotQuery.data) {
        const found = systemSnapshotQuery.data.agents.find(
          (a) => a.agent_id === agentId,
        );
        if (found) return resolveAgentLabel(found);
      }
      if (snapshotQuery.data) {
        const tile = snapshotQuery.data.grid.find(
          (t) => t.agent.agent_id === agentId,
        );
        if (tile) return resolveAgentLabel(tile.agent);
      }
      return formatShortId(agentId);
    },
    [systemSnapshotQuery.data, snapshotQuery.data],
  );

  // B3-b: Derive project control projection for system tab agents
  const systemTabProjectControlProjection = React.useMemo(() => {
    if (activeTab !== 'system') return null;
    if (!selectedAgent) return null;
    if (selectedAgent.project_id === SYSTEM_SCOPE_SENTINEL_PROJECT_ID) return null;
    return systemSnapshotQuery.data?.projectControls[selectedAgent.project_id as ProjectId] ?? null;
  }, [activeTab, selectedAgent, systemSnapshotQuery.data]);

  const handleClosePopup = React.useCallback(() => {
    activeTabState.setSelectedTarget(null);
  }, [activeTabState]);

  // ---- Projects tab: auto-select logic ----
  React.useEffect(() => {
    if (activeTab !== 'projects') return;
    if (!snapshotQuery.data) return;

    const snapshot = snapshotQuery.data;
    const currentTarget = projectsTab.selectedTarget;

    const currentSelectionValid =
      currentTarget?.agentId != null &&
      snapshot.grid.some((tile) => tile.agent.agent_id === currentTarget.agentId);
    const currentNodeValid =
      currentTarget?.nodeDefinitionId != null &&
      snapshot.grid.some(
        (tile) =>
          tile.agent.workflow_node_definition_id === currentTarget.nodeDefinitionId,
      );

    if (!selectedRunId && snapshot.workflowRunId) {
      setSelectedRunId(snapshot.workflowRunId);
    }

    if (currentSelectionValid || currentNodeValid) return;

    const preferred =
      snapshot.grid.find(
        (tile) =>
          tile.agent.agent_id === linkedAgentId ||
          tile.agent.workflow_node_definition_id === linkedNodeId,
      ) ??
      snapshot.grid.find((tile) => tile.agent.urgency_level === 'urgent') ??
      snapshot.grid[0];

    if (!preferred) return;

    projectsTab.setSelectedTarget({
      agentId: preferred.agent.agent_id,
      nodeDefinitionId: preferred.agent.workflow_node_definition_id ?? null,
      workflowRunId: preferred.agent.workflow_run_id ?? snapshot.workflowRunId ?? null,
    });
  }, [
    activeTab,
    linkedAgentId,
    linkedNodeId,
    selectedRunId,
    projectsTab.selectedTarget?.agentId,
    projectsTab.selectedTarget?.nodeDefinitionId,
    snapshotQuery.data,
  ]);

  // ---- Handlers ----

  const handleSelectTile = (tile: MaoGridTileProjection) => {
    const snapshot = snapshotQuery.data;
    startTransition(() => {
      setSelectedRunId(tile.agent.workflow_run_id ?? snapshot?.workflowRunId ?? null);
      projectsTab.setSelectedTarget({
        agentId: tile.agent.agent_id,
        nodeDefinitionId: tile.agent.workflow_node_definition_id ?? null,
        workflowRunId: tile.agent.workflow_run_id ?? snapshot?.workflowRunId ?? null,
      });
    });
  };

  const handleSelectAgent = (agent: MaoAgentProjection) => {
    startTransition(() => {
      systemTab.setSelectedTarget({
        agentId: agent.agent_id,
        nodeDefinitionId: agent.workflow_node_definition_id ?? null,
        workflowRunId: agent.workflow_run_id ?? null,
      });
    });
  };

  const executeControl = (
    action: MaoProjectControlAction,
    reason: string,
    commandId: string,
    confirmationProof?: ConfirmationProof,
  ) => {
    const targetProjectId =
      selectedAgent?.project_id ??
      projectId;

    if (!targetProjectId) return;

    const snapshot = snapshotQuery.data;

    controlMutation.mutate({
      request: {
        command_id: commandId as any,
        project_id: targetProjectId as ProjectId,
        action,
        actor_id: 'principal-operator',
        actor_type: 'operator',
        reason,
        requested_at: new Date().toISOString(),
        impactSummary: {
          activeRunCount: snapshot?.workflowRunId ? 1 : 0,
          activeAgentCount: snapshot?.summary.activeAgentCount ?? 0,
          blockedAgentCount: snapshot?.summary.blockedAgentCount ?? 0,
          urgentAgentCount: snapshot?.summary.urgentAgentCount ?? 0,
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

  // ---- Render ----

  const snapshot = snapshotQuery.data;
  const systemSnapshot = systemSnapshotQuery.data;

  const isProjectsLoading =
    activeTab === 'projects' &&
    projectId != null &&
    (snapshotQuery.isLoading || !snapshot);

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 'var(--nous-space-4xl)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-3xl)' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--nous-space-2xl)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-2xs)' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>MAO Operating Surface</h1>
          <p style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
            Inspect density-aware runtime projections, follow evidence-linked
            reasoning previews, and apply governed project-scope controls from
            canonical workflow and opctl truth.
          </p>
        </div>
        {activeTab === 'projects' && snapshot ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
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
              <Badge variant="outline" style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#f59e0b' }}>
                degraded: {snapshot.diagnostics.degradedReasonCode}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Navigation context banner */}
      {linkedRunId || linkedNodeId || linkedAgentId || maoContext || linkedSource === 'marketplace' ? (
        <div style={{
          borderRadius: 'var(--nous-radius-sm)',
          border: '1px solid var(--nous-border-subtle)',
          backgroundColor: 'rgba(26,26,26,0.2)',
          paddingInline: 'var(--nous-space-2xl)',
          paddingBlock: 'var(--nous-space-xl)',
          fontSize: 'var(--nous-font-size-sm)',
          color: 'var(--nous-fg-muted)',
        }}>
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
              style={{ marginLeft: 'var(--nous-space-sm)', textDecoration: 'underline', textUnderlineOffset: '4px' }}
            >
              Return to MAO root context
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 'var(--nous-space-sm)' }} data-testid="tab-bar">
        <Button
          variant={activeTab === 'system' ? 'default' : 'outline'}
          onClick={() => setActiveTab('system')}
          data-testid="tab-system"
        >
          System
        </Button>
        <Button
          variant={activeTab === 'projects' ? 'default' : 'outline'}
          onClick={() => setActiveTab('projects')}
          data-testid="tab-projects"
        >
          Projects
        </Button>
      </div>

      {/* Density mode selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
        {DENSITY_MODES.map((mode) => (
          <Button
            key={mode}
            variant={activeTabState.densityMode === mode ? 'default' : 'outline'}
            onClick={() => startTransition(() => activeTabState.setDensityMode(mode))}
          >
            {mode}
          </Button>
        ))}
      </div>

      {/* Tab content */}
      {/*
        * @todo START-005 — Unauthorized start attempt alert surface (system-level).
        * This placeholder reserves the location for a future system-wide alert
        * banner that surfaces unauthorized start attempt events from the backend.
        * No runtime behavior. Deferred to follow-on WR.
        */}
      <div data-testid="start-005-stub-system" aria-hidden="true" style={{ display: 'none' }} />

      {activeTab === 'system' ? (
        <div data-testid="system-tab-content">
          {systemSnapshotQuery.isLoading || !systemSnapshot ? (
            <div style={{ padding: 'var(--nous-space-4xl)' }}>
              <p style={{ color: 'var(--nous-fg-muted)' }}>
                Loading system-wide operating surface...
              </p>
            </div>
          ) : (
            <MaoLeaseTree
              snapshot={systemSnapshot}
              densityMode={systemTab.densityMode}
              selectedAgentId={systemTab.selectedTarget?.agentId ?? null}
              onSelectAgent={handleSelectAgent}
            />
          )}
        </div>
      ) : (
        <div data-testid="projects-tab-content">
          {!projectId ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', padding: 'var(--nous-space-4xl)' }}>
              <p style={{ color: 'var(--nous-fg-muted)' }}>
                Select a project to inspect the MAO operating surface.
              </p>
            </div>
          ) : isProjectsLoading ? (
            <div style={{ padding: 'var(--nous-space-4xl)' }}>
              <p style={{ color: 'var(--nous-fg-muted)' }}>Loading MAO operating surface...</p>
            </div>
          ) : snapshot ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-3xl)' }}>
              <MaoDensityGrid
                snapshot={snapshot}
                selectedAgentId={projectsTab.selectedTarget?.agentId ?? null}
                onSelectTile={handleSelectTile}
              />
              <MaoRunGraph
                graph={snapshot.graph}
                selectedNodeId={projectsTab.selectedTarget?.nodeDefinitionId ?? null}
                onSelectNode={(next) =>
                  startTransition(() => {
                    setSelectedRunId(
                      next.workflowRunId ?? snapshot.workflowRunId ?? null,
                    );
                    projectsTab.setSelectedTarget({
                      agentId: next.agentId ?? null,
                      nodeDefinitionId: next.nodeDefinitionId ?? null,
                      workflowRunId:
                        next.workflowRunId ?? snapshot.workflowRunId ?? null,
                    });
                  })
                }
              />
            </div>
          ) : null}
        </div>
      )}

      </div>

      {/* Bottom strip — pinned below scrollable area */}
      <div data-testid="bottom-strip" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-lg)', flexShrink: 0, padding: '0 var(--nous-space-4xl) var(--nous-space-4xl)' }}>
        <MaoBacklogPressureCard />
        {activeTab === 'system' && systemSnapshot ? (
          <MaoSystemHealthStrip snapshot={systemSnapshot} />
        ) : null}
      </div>

      {/* Inspect popup — both tabs, outside scrollable area */}
      <MaoInspectPopup
        open={popupOpen}
        onClose={handleClosePopup}
        agent={selectedAgent}
        projectSnapshot={
          activeTab === 'projects' && snapshot ? snapshot : null
        }
        projectControlProjection={systemTabProjectControlProjection}
        controlPending={controlMutation.isPending}
        lastControlResult={lastResult}
        onRequestControl={handleRequestControl}
        resolveAgentLabel={resolveAgentLabelFn}
      />

      {/* T3 confirmation dialog */}
      <MaoT3ConfirmationDialog
        open={pendingT3Action !== null}
        action={pendingT3Action?.action ?? 'resume_project'}
        projectId={(selectedAgent?.project_id ?? projectId ?? '') as ProjectId}
        impactSummary={{
          activeRunCount: snapshot?.workflowRunId ? 1 : 0,
          activeAgentCount: snapshot?.summary.activeAgentCount ?? 0,
          blockedAgentCount: snapshot?.summary.blockedAgentCount ?? 0,
          urgentAgentCount: snapshot?.summary.urgentAgentCount ?? 0,
        }}
        onConfirm={handleT3Confirm}
        onCancel={handleT3Cancel}
      />
    </div>
  );
}
