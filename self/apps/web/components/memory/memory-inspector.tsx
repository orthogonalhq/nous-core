'use client';

import * as React from 'react';
import type {
  ConfidenceGovernanceEvaluationResult,
  ExperienceRecord,
  LearnedBehaviorExplanation,
  MemoryEntry,
  MemoryMutationAuditRecord,
  MemoryTombstone,
  Phase6ConfidenceSignalExport,
  Phase6DistilledPatternExport,
  PolicyDecisionRecord,
  ProjectId,
  StmContext,
  TraceEvidenceReference,
} from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import {
  createDefaultLearningFilters,
  MemoryLearningFilterBar,
  type LearningFilterState,
} from './memory-learning-filter-bar';
import { MemoryLearningOverview } from './memory-learning-overview';
import { MemoryLearningDetail } from './memory-learning-detail';
import {
  createDefaultMemoryFilters,
  MemoryFilterBar,
  type MemoryFilterState,
} from './memory-filter-bar';
import { MemoryEntryList } from './memory-entry-list';
import { MemoryEntryDetail } from './memory-entry-detail';

interface MemoryExportBundle {
  stm: StmContext;
  entries: MemoryEntry[];
  audit: MemoryMutationAuditRecord[];
  tombstones: MemoryTombstone[];
}

interface MemoryDenialProjection {
  candidate: {
    content: string;
  };
  reason: string;
  decisionRecord?: PolicyDecisionRecord;
  traceId?: string;
  timestamp?: string;
}

interface LearningPatternSummary {
  pattern: Phase6DistilledPatternExport;
  confidenceSignal: Phase6ConfidenceSignalExport;
  contradictionStatus: 'none' | 'detected' | 'blocking';
  stalenessStatus: 'fresh' | 'aging' | 'stale';
  flaggedForRetirement: boolean;
  sourceCount: number;
  missingSourceCount: number;
  lineageIntegrityStatus:
    | 'complete'
    | 'missing-sources'
    | 'missing-evidence'
    | 'mixed';
}

interface LearningPatternDetail {
  pattern: {
    id: string;
    content: string;
    confidence: number;
    provenance: {
      traceId?: string;
      source: string;
      timestamp: string;
    };
    tags: string[];
    createdAt: string;
    updatedAt: string;
    lifecycleStatus: string;
    basedOn: string[];
    supersedes: string[];
    evidenceRefs: TraceEvidenceReference[];
  };
  patternExport: Phase6DistilledPatternExport;
  confidenceSignal: Phase6ConfidenceSignalExport;
  sourceTimeline: ExperienceRecord[];
  lifecycleEvents: Array<{
    id: string;
    kind: string;
    label: string;
    at?: string;
    derived: true;
    relatedEntryId?: string;
  }>;
  decisionProjections: Array<{
    scenarioId: string;
    label: string;
    projectionBasis: 'representative' | 'current-control-state';
    explanation: LearnedBehaviorExplanation;
    evaluation: ConfidenceGovernanceEvaluationResult;
  }>;
  lineage: {
    supersededIds: string[];
    missingSourceIds: string[];
    rollbackVisibility: 'available' | 'retired' | 'degraded';
    lineageIntegrityStatus:
      | 'complete'
      | 'missing-sources'
      | 'missing-evidence'
      | 'mixed';
  };
  diagnostics: {
    projectControlState?: string;
    historicalDecisionLogAvailable: false;
    missingEvidenceRefs: boolean;
  };
}

interface ActionMessage {
  tone: 'info' | 'success' | 'error';
  text: string;
}

interface MemoryInspectorProps {
  projectId: string;
  downloadExport?: (
    projectId: string,
    payload: MemoryExportBundle,
  ) => void;
}

export function MemoryInspector({
  projectId,
  downloadExport = downloadMemoryExport,
}: MemoryInspectorProps) {
  const typedProjectId = projectId as ProjectId;
  const [viewMode, setViewMode] = React.useState<'inspect' | 'learning'>(
    'inspect',
  );
  const [filters, setFilters] = React.useState<MemoryFilterState>(
    createDefaultMemoryFilters(),
  );
  const [learningFilters, setLearningFilters] = React.useState<LearningFilterState>(
    createDefaultLearningFilters(),
  );
  const [selectedEntryId, setSelectedEntryId] = React.useState<string | null>(null);
  const [selectedLearningPatternId, setSelectedLearningPatternId] = React.useState<
    string | null
  >(null);
  const [exportConfirmationOpen, setExportConfirmationOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [deleteMode, setDeleteMode] = React.useState<'soft' | 'hard' | null>(null);
  const [deleteRationale, setDeleteRationale] = React.useState('');
  const [actionMessage, setActionMessage] = React.useState<ActionMessage | null>(null);

  const utils = trpc.useUtils();
  const inspectQuery = trpc.memory.inspect.useQuery({
    projectId: typedProjectId,
    scope: filters.scope,
    query: filters.query.trim() || undefined,
    types: filters.type === 'all' ? undefined : [filters.type],
    lifecycleStatus:
      filters.lifecycleStatus === 'all' ? undefined : filters.lifecycleStatus,
    includeSuperseded: filters.includeSuperseded || undefined,
    includeDeleted: filters.includeDeleted || undefined,
    placementState:
      filters.placementState === 'all' ? undefined : filters.placementState,
    tags: parseTags(filters.tags),
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
  });
  const learningOverviewQuery = trpc.memory.learningOverview.useQuery({
    projectId: typedProjectId,
    query: learningFilters.query.trim() || undefined,
    tier: learningFilters.tier,
    decayState: learningFilters.decayState,
    includeRetired: learningFilters.includeRetired,
    sortBy: learningFilters.sortBy,
    sortDirection: learningFilters.sortDirection,
  });
  const learningDetailQuery = trpc.memory.learningDetail.useQuery(
    {
      projectId: typedProjectId,
      patternId: selectedLearningPatternId as any,
    },
    {
      enabled: selectedLearningPatternId != null,
    },
  );
  const denialsQuery = trpc.memory.denials.useQuery({ projectId: typedProjectId });
  const auditQuery = trpc.memory.audit.useQuery({ projectId: typedProjectId });
  const tombstonesQuery = trpc.memory.tombstones.useQuery({ projectId: typedProjectId });
  const deleteMutation = trpc.memory.delete.useMutation();

  const entries = inspectQuery.data?.entries ?? [];
  const learningItems =
    (learningOverviewQuery.data?.items ?? []) as LearningPatternSummary[];
  const learningDetail = (learningDetailQuery.data ?? null) as
    | LearningPatternDetail
    | null;
  const denials = (denialsQuery.data ?? []) as MemoryDenialProjection[];
  const audit = auditQuery.data ?? [];
  const tombstones = tombstonesQuery.data ?? [];
  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const selectedAudit = selectedEntry
    ? audit.filter(
        (record) =>
          record.id === selectedEntry.lastMutationId ||
          record.targetEntryId === selectedEntry.id ||
          record.resultingEntryId === selectedEntry.id ||
          record.tombstoneId === selectedEntry.tombstoneId,
      )
    : [];
  const selectedTombstones = selectedEntry
    ? tombstones.filter(
        (tombstone) =>
          tombstone.id === selectedEntry.tombstoneId ||
          tombstone.targetEntryId === selectedEntry.id,
      )
    : [];

  React.useEffect(() => {
    if (entries.length === 0) {
      setSelectedEntryId(null);
      return;
    }

    if (selectedEntryId == null || !entries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(entries[0].id);
    }
  }, [entries, selectedEntryId]);

  React.useEffect(() => {
    if (selectedLearningPatternId == null && learningItems.length > 0) {
      setSelectedLearningPatternId(learningItems[0].pattern.id);
      return;
    }

    if (
      selectedLearningPatternId != null &&
      learningDetail == null &&
      learningItems.length > 0 &&
      !learningItems.some((item) => item.pattern.id === selectedLearningPatternId)
    ) {
      setSelectedLearningPatternId(learningItems[0].pattern.id);
    }
  }, [learningDetail, learningItems, selectedLearningPatternId]);

  async function invalidateMemoryData() {
    await Promise.all([
      utils.memory.inspect.invalidate(),
      utils.memory.learningOverview.invalidate(),
      utils.memory.learningDetail.invalidate(),
      utils.memory.denials.invalidate(),
      utils.memory.audit.invalidate(),
      utils.memory.tombstones.invalidate(),
    ]);
  }

  function openLearningVisibility(entryId: string) {
    setSelectedLearningPatternId(entryId);
    setViewMode('learning');
  }

  async function handleConfirmExport() {
    setIsExporting(true);
    setActionMessage({
      tone: 'info',
      text: 'Preparing the selected project memory bundle export...',
    });

    try {
      const payload = await utils.memory.export.fetch({ projectId: typedProjectId });
      downloadExport(projectId, payload);
      setActionMessage({
        tone: 'success',
        text: `Export ready. Bundle contains ${payload.entries.length} entries, ${payload.audit.length} audit records, and ${payload.tombstones.length} tombstones.`,
      });
      setExportConfirmationOpen(false);
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: `Export failed: ${getErrorMessage(error)}`,
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!selectedEntry) {
      return;
    }

    if (deleteMode === 'hard' && deleteRationale.trim().length === 0) {
      setActionMessage({
        tone: 'error',
        text: 'Hard delete requires a rationale before confirmation.',
      });
      return;
    }

    setActionMessage({
      tone: 'info',
      text: `Applying ${deleteMode === 'hard' ? 'hard' : 'soft'} delete...`,
    });

    try {
      const response = await deleteMutation.mutateAsync({
        id: selectedEntry.id,
        hard: deleteMode === 'hard',
        rationale: deleteMode === 'hard' ? deleteRationale.trim() : undefined,
      });

      if (response.result?.applied) {
        setActionMessage({
          tone: 'success',
          text: `${deleteMode === 'hard' ? 'Hard' : 'Soft'} delete applied (${response.result.reasonCode}).`,
        });
      } else if (response.result) {
        setActionMessage({
          tone: 'error',
          text: `Delete not applied (${response.result.reasonCode}): ${response.result.reason}`,
        });
      } else {
        setActionMessage({
          tone: 'error',
          text: 'Delete did not return a canonical mutation result.',
        });
      }

      setDeleteMode(null);
      setDeleteRationale('');
      await invalidateMemoryData();
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: `Delete failed: ${getErrorMessage(error)}`,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Memory Inspector</h1>
          <p className="text-sm text-muted-foreground">
            Search canonical durable memory, inspect provenance, and trace how
            learned patterns influence governed outcomes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={viewMode === 'inspect' ? 'default' : 'outline'}
            onClick={() => setViewMode('inspect')}
          >
            Inspect
          </Button>
          <Button
            variant={viewMode === 'learning' ? 'default' : 'outline'}
            onClick={() => setViewMode('learning')}
          >
            Learning
          </Button>
          <Button
            variant="outline"
            onClick={() => setExportConfirmationOpen((current) => !current)}
          >
            {exportConfirmationOpen ? 'Close export prompt' : 'Export project memory'}
          </Button>
        </div>
      </div>

      {exportConfirmationOpen ? (
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base">Export Confirmation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            <p className="text-muted-foreground">
              This exports the selected project's full memory bundle: STM context,
              durable entries, mutation audit, and tombstones. Current filters do
              not narrow the exported payload.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleConfirmExport} disabled={isExporting}>
                {isExporting ? 'Preparing export...' : 'Confirm export'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setExportConfirmationOpen(false)}
                disabled={isExporting}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {actionMessage ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            actionMessage.tone === 'success'
              ? 'border-green-600/40 bg-green-500/10 text-green-700'
              : actionMessage.tone === 'error'
                ? 'border-red-600/40 bg-red-500/10 text-red-700'
                : 'border-border bg-muted/20 text-foreground'
          }`}
        >
          {actionMessage.text}
        </div>
      ) : null}

      {viewMode === 'inspect' &&
      inspectQuery.data?.diagnostics.globalScopeDecision &&
      inspectQuery.data.diagnostics.requestedScope !== 'project' ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            inspectQuery.data.diagnostics.globalScopeDecision.outcome === 'denied'
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-800'
              : 'border-border bg-muted/20 text-foreground'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {inspectQuery.data.diagnostics.globalScopeDecision.reasonCode}
            </Badge>
            <span>{inspectQuery.data.diagnostics.globalScopeDecision.reason}</span>
          </div>
        </div>
      ) : null}

      {viewMode === 'inspect' ? (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-6">
            <MemoryFilterBar
              filters={filters}
              onChange={(next) => setFilters((current) => ({ ...current, ...next }))}
              onReset={() => setFilters(createDefaultMemoryFilters())}
              resultCount={entries.length}
            />
            <MemoryEntryList
              entries={entries}
              isLoading={inspectQuery.isLoading}
              selectedEntryId={selectedEntryId}
              onSelect={setSelectedEntryId}
            />
          </div>

          <MemoryEntryDetail
            entry={selectedEntry}
            audit={selectedAudit}
            tombstones={selectedTombstones}
            deleteMode={deleteMode}
            deleteRationale={deleteRationale}
            isDeleting={deleteMutation.isPending}
            onStartDelete={(mode) => setDeleteMode(mode)}
            onCancelDelete={() => {
              setDeleteMode(null);
              setDeleteRationale('');
            }}
            onConfirmDelete={handleConfirmDelete}
            onDeleteRationaleChange={setDeleteRationale}
            onOpenLearning={openLearningVisibility}
          />

          <div className="space-y-6">
            <Card>
              <CardHeader className="border-b border-border">
                <CardTitle className="text-base">Denied Candidates</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {denialsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading denied candidates...
                  </p>
                ) : denials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No denied memory candidates for this project.
                  </p>
                ) : (
                  <ScrollArea className="max-h-[16rem] space-y-3">
                    <div className="space-y-3">
                      {denials.map((denial, index) => (
                        <div
                          key={`${denial.traceId ?? 'trace'}-${index}`}
                          className="rounded-md border border-border p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {denial.decisionRecord?.reasonCode ?? 'no-code'}
                            </Badge>
                            {denial.traceId ? (
                              <span className="text-xs text-muted-foreground">
                                trace {denial.traceId.slice(0, 8)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 font-medium">{denial.reason}</p>
                          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                            {denial.candidate.content}
                          </p>
                          {denial.timestamp ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {denial.timestamp}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border">
                <CardTitle className="text-base">Mutation Audit</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {auditQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading audit records...</p>
                ) : audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No mutation audit records for this project.
                  </p>
                ) : (
                  <ScrollArea className="max-h-[16rem] space-y-3">
                    <div className="space-y-3">
                      {audit.map((record) => (
                        <div
                          key={record.id}
                          className="rounded-md border border-border p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{record.action}</Badge>
                            <Badge variant="secondary">{record.outcome}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {record.reasonCode}
                            </span>
                          </div>
                          <p className="mt-2 text-muted-foreground">{record.reason}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border">
                <CardTitle className="text-base">Tombstones</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {tombstonesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading tombstones...</p>
                ) : tombstones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tombstones for this project.
                  </p>
                ) : (
                  <ScrollArea className="max-h-[16rem] space-y-3">
                    <div className="space-y-3">
                      {tombstones.map((tombstone) => (
                        <div
                          key={tombstone.id}
                          className="rounded-md border border-border p-3 text-sm"
                        >
                          <p className="font-medium text-foreground">
                            {tombstone.targetEntryId}
                          </p>
                          <p className="mt-1 text-muted-foreground">{tombstone.reason}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tombstone.createdAt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-6">
            <MemoryLearningFilterBar
              filters={learningFilters}
              onChange={(next) =>
                setLearningFilters((current) => ({ ...current, ...next }))
              }
              onReset={() => setLearningFilters(createDefaultLearningFilters())}
              resultCount={learningItems.length}
            />
            <Card>
              <CardHeader className="border-b border-border">
                <CardTitle className="text-base">Interpretation Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-4 text-sm text-muted-foreground">
                <p>Learning visibility stays inside the inspect-first memory route.</p>
                <p>Lifecycle events are derived from canonical timestamps and confidence configuration.</p>
                <p>Governance cards are representative projections, not historical workflow-runtime decisions.</p>
              </CardContent>
            </Card>
          </div>

          <MemoryLearningOverview
            items={learningItems}
            isLoading={learningOverviewQuery.isLoading}
            selectedPatternId={selectedLearningPatternId}
            onSelect={setSelectedLearningPatternId}
          />

          <MemoryLearningDetail
            detail={learningDetail}
            isLoading={learningDetailQuery.isLoading}
          />
        </div>
      )}
    </div>
  );
}

function parseTags(value: string): string[] | undefined {
  const tags = value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function downloadMemoryExport(projectId: string, payload: MemoryExportBundle) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nous-memory-${projectId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
