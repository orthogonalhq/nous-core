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
  denialsUseQuery: vi.fn(),
  auditUseQuery: vi.fn(),
  tombstonesUseQuery: vi.fn(),
  deleteUseMutation: vi.fn(),
  useUtils: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    memory: {
      inspect: { useQuery: mocks.inspectUseQuery },
      denials: { useQuery: mocks.denialsUseQuery },
      audit: { useQuery: mocks.auditUseQuery },
      tombstones: { useQuery: mocks.tombstonesUseQuery },
      delete: { useMutation: mocks.deleteUseMutation },
    },
    useUtils: mocks.useUtils,
  },
}));

import { MemoryInspector } from '@/components/memory/memory-inspector';

describe('MemoryInspector', () => {
  const exportFetch = vi.fn<() => Promise<MemoryExportBundle>>();
  const inspectInvalidate = vi.fn<() => Promise<void>>();
  const denialsInvalidate = vi.fn<() => Promise<void>>();
  const auditInvalidate = vi.fn<() => Promise<void>>();
  const tombstonesInvalidate = vi.fn<() => Promise<void>>();
  const mutateAsync = vi.fn();
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
    mocks.useUtils.mockReturnValue({
      memory: {
        inspect: { invalidate: inspectInvalidate },
        denials: { invalidate: denialsInvalidate },
        audit: { invalidate: auditInvalidate },
        tombstones: { invalidate: tombstonesInvalidate },
        export: { fetch: exportFetch },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders entries, denied diagnostics, and updates inspect query inputs from filter controls', async () => {
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

  it('requires rationale before hard delete and surfaces canonical mutation outcomes', async () => {
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
    type: 'preference',
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
