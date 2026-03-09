// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MemoryEntry,
  MemoryMutationAuditRecord,
  MemoryTombstone,
  PolicyDecisionRecord,
  ProjectId,
  StmContext,
} from '@nous/shared';

const projectId = 'project-memory-ui' as ProjectId;

const mocks = vi.hoisted(() => ({
  inspectUseQuery: vi.fn(),
  learningOverviewUseQuery: vi.fn(),
  learningDetailUseQuery: vi.fn(),
  denialsUseQuery: vi.fn(),
  auditUseQuery: vi.fn(),
  tombstonesUseQuery: vi.fn(),
  deleteUseMutation: vi.fn(),
  discoveryUseQuery: vi.fn(),
  discoverySnapshotUseQuery: vi.fn(),
  discoveryRefreshUseMutation: vi.fn(),
  useUtils: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    memory: {
      inspect: { useQuery: mocks.inspectUseQuery },
      learningOverview: { useQuery: mocks.learningOverviewUseQuery },
      learningDetail: { useQuery: mocks.learningDetailUseQuery },
      denials: { useQuery: mocks.denialsUseQuery },
      audit: { useQuery: mocks.auditUseQuery },
      tombstones: { useQuery: mocks.tombstonesUseQuery },
      delete: { useMutation: mocks.deleteUseMutation },
    },
    discovery: {
      discover: { useQuery: mocks.discoveryUseQuery },
      snapshot: { useQuery: mocks.discoverySnapshotUseQuery },
      refresh: { useMutation: mocks.discoveryRefreshUseMutation },
    },
    useUtils: mocks.useUtils,
  },
}));

import { MemoryInspector } from '@/components/memory/memory-inspector';

describe('MemoryInspector', () => {
  const exportFetch = vi.fn<() => Promise<MemoryExportBundle>>();
  const inspectInvalidate = vi.fn<() => Promise<void>>();
  const learningOverviewInvalidate = vi.fn<() => Promise<void>>();
  const learningDetailInvalidate = vi.fn<() => Promise<void>>();
  const denialsInvalidate = vi.fn<() => Promise<void>>();
  const auditInvalidate = vi.fn<() => Promise<void>>();
  const tombstonesInvalidate = vi.fn<() => Promise<void>>();
  const discoveryInvalidate = vi.fn<() => Promise<void>>();
  const discoverySnapshotInvalidate = vi.fn<() => Promise<void>>();
  const mutateAsync = vi.fn();
  const refreshMutateAsync = vi.fn();
  const downloadExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.inspectUseQuery.mockReturnValue({
      data: {
        entries: [createEntry()],
        diagnostics: {
          requestedScope: 'all',
          projectInheritsGlobal: false,
          globalScopeDecision: createDecisionRecord(),
        },
      },
      isLoading: false,
    });
    mocks.learningOverviewUseQuery.mockReturnValue({
      data: {
        items: [createLearningSummary()],
      },
      isLoading: false,
    });
    mocks.learningDetailUseQuery.mockReturnValue({
      data: createLearningDetail(),
      isLoading: false,
    });
    mocks.denialsUseQuery.mockReturnValue({
      data: [
        {
          candidate: { content: 'Denied candidate body' },
          reason: 'Global write denied',
          decisionRecord: createDecisionRecord(),
          traceId: 'trace-1',
          timestamp: '2026-03-07T19:00:00.000Z',
        },
      ],
      isLoading: false,
    });
    mocks.auditUseQuery.mockReturnValue({
      data: [createAuditRecord()],
      isLoading: false,
    });
    mocks.tombstonesUseQuery.mockReturnValue({
      data: [createTombstone()],
      isLoading: false,
    });
    mocks.deleteUseMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mocks.discoveryUseQuery.mockReturnValue({
      data: createDiscoveryResult(),
      isLoading: false,
    });
    mocks.discoverySnapshotUseQuery.mockReturnValue({
      data: createDiscoverySnapshot(),
      isLoading: false,
    });
    mocks.discoveryRefreshUseMutation.mockReturnValue({
      mutateAsync: refreshMutateAsync,
      isPending: false,
    });
    mocks.useUtils.mockReturnValue({
      memory: {
        inspect: { invalidate: inspectInvalidate },
        learningOverview: { invalidate: learningOverviewInvalidate },
        learningDetail: { invalidate: learningDetailInvalidate },
        denials: { invalidate: denialsInvalidate },
        audit: { invalidate: auditInvalidate },
        tombstones: { invalidate: tombstonesInvalidate },
        export: { fetch: exportFetch },
      },
      discovery: {
        discover: { invalidate: discoveryInvalidate },
        snapshot: { invalidate: discoverySnapshotInvalidate },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders inspection diagnostics and updates inspect query inputs from filter controls', async () => {
    render(<MemoryInspector projectId={projectId} />);

    expect(screen.getByText('Memory Inspector')).toBeTruthy();
    expect(
      screen.getAllByText('Project preference for concise updates').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('POL-GLOBAL-DENIED').length).toBeGreaterThan(0);
    expect(screen.getByText('Global write denied')).toBeTruthy();
    expect(screen.getByText('trace trace-1')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'release rollout' },
    });
    fireEvent.change(screen.getByLabelText('Scope'), {
      target: { value: 'global' },
    });
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'experience-record' },
    });

    await waitFor(() => {
      expect(mocks.inspectUseQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          projectId,
          query: 'release rollout',
          scope: 'global',
          types: ['experience-record'],
        }),
      );
    });
  });

  it('switches from entry inspection into learning visibility and renders derived and representative caveats', async () => {
    render(<MemoryInspector projectId={projectId} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Open learning visibility' }),
    );

    expect(await screen.findByText('Learning Detail')).toBeTruthy();
    expect(
      screen.getByText(
        /Lifecycle events below are derived from canonical timestamps/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Governance cards are representative projections over current canonical contracts/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Representative high-risk memory write')).toBeTruthy();
    expect(screen.getByText('CGR-DEFER-HIGH-RISK-CONFIRMATION')).toBeTruthy();

    await waitFor(() => {
      expect(mocks.learningOverviewUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({ projectId }),
      );
      expect(mocks.learningDetailUseQuery).toHaveBeenCalled();
    });
  });

  it('requires rationale before hard delete and invalidates inspect and learning queries on success', async () => {
    mutateAsync.mockResolvedValue({
      deleted: 1,
      result: {
        applied: true,
        reason: 'approved',
        reasonCode: 'MEM-HARD-DELETE-APPLIED',
      },
    });

    render(<MemoryInspector projectId={projectId} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hard delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm hard delete' }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText('Hard delete requires a rationale before confirmation.'),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Rationale'), {
      target: { value: 'principal approved permanent removal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm hard delete' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 'entry-1',
        hard: true,
        rationale: 'principal approved permanent removal',
      });
    });
    expect(
      await screen.findByText('Hard delete applied (MEM-HARD-DELETE-APPLIED).'),
    ).toBeTruthy();
    expect(inspectInvalidate).toHaveBeenCalled();
    expect(learningOverviewInvalidate).toHaveBeenCalled();
    expect(learningDetailInvalidate).toHaveBeenCalled();
    expect(denialsInvalidate).toHaveBeenCalled();
    expect(auditInvalidate).toHaveBeenCalled();
    expect(tombstonesInvalidate).toHaveBeenCalled();
  });

  it('requires explicit export confirmation before fetching and downloading the project bundle', async () => {
    exportFetch.mockResolvedValue({
      stm: {
        entries: [],
        tokenCount: 0,
      },
      entries: [createEntry()],
      audit: [createAuditRecord()],
      tombstones: [createTombstone()],
    });

    render(
      <MemoryInspector projectId={projectId} downloadExport={downloadExport} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Export project memory' }),
    );
    expect(
      screen.getByText(
        /This exports the selected project's full memory bundle/i,
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm export' }));

    await waitFor(() => {
      expect(exportFetch).toHaveBeenCalledWith({ projectId });
    });
    expect(downloadExport).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ id: 'entry-1' }),
        ]),
      }),
    );
    expect(
      await screen.findByText(
        'Export ready. Bundle contains 1 entries, 1 audit records, and 1 tombstones.',
      ),
    ).toBeTruthy();
  });

  it('renders discovery mode and invalidates discovery queries after manual refresh', async () => {
    refreshMutateAsync.mockResolvedValue({
      outcome: 'updated',
    });

    render(<MemoryInspector projectId={projectId} />);

    fireEvent.click(screen.getByRole('button', { name: 'Discover' }));

    expect(await screen.findByText('Discovery Results')).toBeTruthy();
    expect(screen.getByText('denied 1')).toBeTruthy();
    expect(screen.getByText('POL-CANNOT-BE-READ-BY')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh knowledge' }));

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledWith({ projectId });
    });
    expect(await screen.findByText('Knowledge refresh completed (updated).')).toBeTruthy();
    expect(discoveryInvalidate).toHaveBeenCalled();
    expect(discoverySnapshotInvalidate).toHaveBeenCalled();
  });
});

interface MemoryExportBundle {
  stm: StmContext;
  entries: MemoryEntry[];
  audit: MemoryMutationAuditRecord[];
  tombstones: MemoryTombstone[];
}

function createEntry(): MemoryEntry {
  return {
    id: 'entry-1' as any,
    content: 'Project preference for concise updates',
    type: 'distilled-pattern',
    scope: 'project',
    projectId,
    confidence: 0.92,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: 'trace-1' as any,
      source: 'memory-ui-test',
      timestamp: '2026-03-07T18:30:00.000Z',
    },
    tags: ['ui', 'preference'],
    createdAt: '2026-03-07T18:30:00.000Z',
    updatedAt: '2026-03-07T19:00:00.000Z',
    mutabilityClass: 'domain-versioned',
    lifecycleStatus: 'active',
    placementState: 'project',
    lastMutationId: 'mutation-1' as any,
    basedOn: ['source-1'] as any,
    supersedes: ['source-1'] as any,
    evidenceRefs: [{ actionCategory: 'memory-write' }] as any,
  } as MemoryEntry;
}

function createLearningSummary() {
  return {
    pattern: {
      id: 'entry-1',
      content: 'Patterns with explicit rollback notes preserve operator trust',
      updatedAt: '2026-03-07T19:00:00.000Z',
      tags: ['learning', 'pattern'],
      basedOn: ['source-1'],
      supersedes: ['source-1'],
    },
    confidenceSignal: {
      confidence: 0.92,
      tier: 'high' as const,
      supportingSignals: 1,
      decayState: 'stable' as const,
    },
    contradictionStatus: 'none' as const,
    stalenessStatus: 'fresh' as const,
    flaggedForRetirement: false,
    sourceCount: 1,
    missingSourceCount: 0,
    lineageIntegrityStatus: 'complete' as const,
  };
}

function createLearningDetail() {
  return {
    pattern: {
      id: 'entry-1',
      content: 'Patterns with explicit rollback notes preserve operator trust',
      confidence: 0.92,
      provenance: {
        traceId: 'trace-1',
        source: 'memory-ui-test',
        timestamp: '2026-03-07T18:30:00.000Z',
      },
      tags: ['learning', 'pattern'],
      createdAt: '2026-03-07T18:30:00.000Z',
      updatedAt: '2026-03-07T19:00:00.000Z',
      lifecycleStatus: 'active',
      basedOn: ['source-1'],
      supersedes: ['source-1'],
      evidenceRefs: [{ actionCategory: 'memory-write' }],
    },
    patternExport: {
      id: 'entry-1',
    },
    confidenceSignal: {
      confidence: 0.92,
      tier: 'high' as const,
      supportingSignals: 1,
      decayState: 'stable' as const,
    },
    sourceTimeline: [
      {
        id: 'source-1',
        content: 'Release review confirms the guarded rollout stayed predictable',
        context: 'release train with rollback notes',
        action: 'deploy guarded release',
        outcome: 'positive operator confidence',
        reason: 'rollback posture remained explicit',
        sentiment: 'strong-positive',
        updatedAt: '2026-03-07T19:00:00.000Z',
        provenance: {
          traceId: 'trace-source-1',
        },
      },
    ],
    lifecycleEvents: [
      {
        id: 'entry-1:pattern-created',
        kind: 'pattern-created',
        label: 'Pattern created from canonical distillation output.',
        at: '2026-03-07T18:30:00.000Z',
        derived: true as const,
      },
    ],
    decisionProjections: [
      {
        scenarioId: 'high-risk-memory-write',
        label: 'Representative high-risk memory write',
        projectionBasis: 'representative' as const,
        explanation: {
          outcomeRef: 'learning-projection:entry-1:high-risk-memory-write',
        },
        evaluation: {
          outcome: 'defer',
          governance: 'may',
          reasonCode: 'CGR-DEFER-HIGH-RISK-CONFIRMATION',
          confidence: 0.92,
          confidenceTier: 'high',
        },
      },
    ],
    lineage: {
      supersededIds: ['source-1'],
      missingSourceIds: [],
      rollbackVisibility: 'available' as const,
      lineageIntegrityStatus: 'complete' as const,
    },
    diagnostics: {
      historicalDecisionLogAvailable: false as const,
      missingEvidenceRefs: false,
      projectControlState: 'running',
    },
  };
}

function createAuditRecord(): MemoryMutationAuditRecord {
  return {
    id: 'mutation-1' as any,
    sequence: 1,
    action: 'create',
    actor: 'operator',
    outcome: 'applied',
    reasonCode: 'MEM-CREATE-APPLIED',
    reason: 'memory created',
    projectId,
    resultingEntryId: 'entry-1' as any,
    traceId: 'trace-1' as any,
    evidenceRefs: [{ actionCategory: 'memory-write' }],
    occurredAt: '2026-03-07T19:00:00.000Z',
  };
}

function createTombstone(): MemoryTombstone {
  return {
    id: 'tombstone-1' as any,
    targetEntryId: 'entry-1' as any,
    targetContentHash:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    deletedByMutationId: 'mutation-2' as any,
    projectId,
    reason: 'erased by operator',
    createdAt: '2026-03-07T19:10:00.000Z',
  };
}

function createDecisionRecord(): PolicyDecisionRecord {
  return {
    id: 'decision-1',
    projectId,
    action: 'retrieve',
    outcome: 'denied',
    reasonCode: 'POL-GLOBAL-DENIED',
    reason: 'inheritsGlobal is false; global access denied',
    traceId: 'trace-1' as any,
    evidenceRefs: [],
    occurredAt: '2026-03-07T19:00:00.000Z',
  };
}

function createDiscoveryResult() {
  return {
    discovery: {
      version: '1.0',
      exportedAt: '2026-03-09T16:30:00.000Z',
      requestingProjectId: projectId,
      projectIds: ['project-discovery-1'],
      results: [
        {
          projectId: 'project-discovery-1',
          rank: 1,
          combinedScore: 0.88,
        },
      ],
      audit: {
        projectIdsDiscovered: ['project-discovery-1'],
        metaVectorCount: 1,
        taxonomyCount: 1,
        relationshipCount: 0,
        mergeStrategy: 'test',
      },
      explainability: [],
    },
    policy: {
      deniedProjectCount: 1,
      reasonCodes: ['POL-CANNOT-BE-READ-BY'],
    },
    snapshot: createDiscoverySnapshot(),
  };
}

function createDiscoverySnapshot() {
  return {
    projectId: 'project-discovery-1',
    metaVector: null,
    taxonomy: [
      {
        id: 'assignment-1',
        projectId: 'project-discovery-1',
        tag: 'release',
        refreshRecordId: 'refresh-1',
        evidenceRefs: [],
        createdAt: '2026-03-09T16:30:00.000Z',
        updatedAt: '2026-03-09T16:30:00.000Z',
      },
    ],
    relationships: {
      projectId: 'project-discovery-1',
      outgoing: [],
      incoming: [],
    },
    latestRefresh: {
      id: 'refresh-1',
      projectId: 'project-discovery-1',
      trigger: 'manual',
      reasonCode: 'operator_refresh',
      inputDigest:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      outcome: 'updated',
      metaVectorState: 'updated',
      taxonomyTagCount: 1,
      relationship: {
        projectId: 'project-discovery-1',
        edgesCreated: 0,
        edgesUpdated: 0,
        edgesInvalidated: 0,
        evidenceRefs: [],
      },
      evidenceRefs: [],
      sourcePatternIds: [],
      startedAt: '2026-03-09T16:30:00.000Z',
      completedAt: '2026-03-09T16:30:00.000Z',
    },
    diagnostics: {
      runtimePosture: 'single_process_local',
      refreshInFlight: false,
      confidenceReasonCodes: [],
    },
  };
}
