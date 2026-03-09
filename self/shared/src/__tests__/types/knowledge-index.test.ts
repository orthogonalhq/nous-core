import { describe, expect, it } from 'vitest';
import {
  KnowledgeRefreshTriggerSchema,
  ProjectKnowledgeRefreshOutcomeSchema,
  ProjectKnowledgeRefreshRequestSchema,
  ProjectKnowledgeRefreshRecordSchema,
  ProjectTaxonomyAssignmentSchema,
  ProjectRelationshipViewSchema,
  ProjectKnowledgeSnapshotSchema,
  ProjectDiscoveryPolicySummarySchema,
} from '../../types/knowledge-index.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const LINEAGE_ID = '550e8400-e29b-41d4-a716-446655440002';
const REFRESH_ID = '550e8400-e29b-41d4-a716-446655440003';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440004';
const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440005';
const NOW = '2026-03-09T00:00:00.000Z';

describe('KnowledgeRefreshTriggerSchema', () => {
  it('accepts manual, workflow, and schedule triggers', () => {
    expect(KnowledgeRefreshTriggerSchema.parse('manual')).toBe('manual');
    expect(KnowledgeRefreshTriggerSchema.parse('workflow')).toBe('workflow');
    expect(KnowledgeRefreshTriggerSchema.parse('schedule')).toBe('schedule');
  });
});

describe('ProjectKnowledgeRefreshRequestSchema', () => {
  it('accepts workflow-linked refresh metadata', () => {
    const parsed = ProjectKnowledgeRefreshRequestSchema.parse({
      projectId: PROJECT_ID,
      trigger: 'workflow',
      reasonCode: 'refresh.project.manual',
      requestedAt: NOW,
      workflowRunId: RUN_ID,
      dispatchLineageId: LINEAGE_ID,
    });
    expect(parsed.projectId).toBe(PROJECT_ID);
    expect(parsed.workflowRunId).toBe(RUN_ID);
  });
});

describe('ProjectKnowledgeRefreshRecordSchema', () => {
  it('accepts a successful refresh record', () => {
    const parsed = ProjectKnowledgeRefreshRecordSchema.parse({
      id: REFRESH_ID,
      projectId: PROJECT_ID,
      trigger: 'schedule',
      reasonCode: 'refresh.project.scheduled',
      inputDigest: 'a'.repeat(64),
      outcome: 'updated',
      metaVectorState: 'updated',
      taxonomyTagCount: 2,
      relationship: {
        projectId: PROJECT_ID,
        edgesCreated: 1,
        edgesUpdated: 0,
        edgesInvalidated: 0,
        evidenceRefs: [{ actionCategory: 'memory-write' }],
      },
      evidenceRefs: [{ actionCategory: 'memory-write' }],
      sourcePatternIds: [PATTERN_ID],
      startedAt: NOW,
      completedAt: NOW,
    });

    expect(parsed.outcome).toBe('updated');
    expect(parsed.relationship.edgesCreated).toBe(1);
  });

  it('rejects invalid inputDigest values', () => {
    expect(() =>
      ProjectKnowledgeRefreshRecordSchema.parse({
        id: REFRESH_ID,
        projectId: PROJECT_ID,
        trigger: 'manual',
        reasonCode: 'refresh.project.manual',
        inputDigest: 'bad-digest',
        outcome: 'failed',
        metaVectorState: 'unchanged',
        taxonomyTagCount: 0,
        relationship: {
          projectId: PROJECT_ID,
          edgesCreated: 0,
          edgesUpdated: 0,
          edgesInvalidated: 0,
          evidenceRefs: [],
        },
        startedAt: NOW,
        completedAt: NOW,
      }),
    ).toThrow();
  });
});

describe('ProjectTaxonomyAssignmentSchema', () => {
  it('accepts deterministic project-tag assignment records', () => {
    const parsed = ProjectTaxonomyAssignmentSchema.parse({
      id: `${PROJECT_ID}::planning`,
      projectId: PROJECT_ID,
      tag: 'planning',
      refreshRecordId: REFRESH_ID,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(parsed.tag).toBe('planning');
  });
});

describe('ProjectRelationshipViewSchema', () => {
  it('defaults outgoing and incoming edges to empty arrays', () => {
    const parsed = ProjectRelationshipViewSchema.parse({
      projectId: PROJECT_ID,
    });
    expect(parsed.outgoing).toEqual([]);
    expect(parsed.incoming).toEqual([]);
  });

  it('accepts relationship edge projections', () => {
    const parsed = ProjectRelationshipViewSchema.parse({
      projectId: PROJECT_ID,
      outgoing: [
        {
          id: EDGE_ID,
          sourceProjectId: PROJECT_ID,
          targetProjectId: RUN_ID,
          strength: 0.8,
          type: 'thematic',
          evidenceRefs: [{ actionCategory: 'memory-write' }],
          sourcePatternIds: [PATTERN_ID],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    expect(parsed.outgoing).toHaveLength(1);
  });
});

describe('ProjectKnowledgeSnapshotSchema', () => {
  it('accepts machine-checkable bounded-support diagnostics', () => {
    const parsed = ProjectKnowledgeSnapshotSchema.parse({
      projectId: PROJECT_ID,
      metaVector: null,
      taxonomy: [],
      relationships: {
        projectId: PROJECT_ID,
      },
      latestRefresh: null,
      diagnostics: {
        runtimePosture: 'single_process_local',
        refreshInFlight: false,
        confidenceReasonCodes: [],
      },
    });
    expect(parsed.diagnostics.runtimePosture).toBe('single_process_local');
  });
});

describe('ProjectDiscoveryPolicySummarySchema', () => {
  it('accepts denial summary without leaking target identity', () => {
    const parsed = ProjectDiscoveryPolicySummarySchema.parse({
      deniedProjectCount: 2,
      reasonCodes: ['POLICY-DENIED', 'CONTROL-STATE-BLOCKED'],
      controlState: 'running',
    });
    expect(parsed.deniedProjectCount).toBe(2);
    expect(parsed.reasonCodes).toHaveLength(2);
  });
});

describe('ProjectKnowledgeRefreshOutcomeSchema', () => {
  it('accepts all supported refresh outcomes', () => {
    expect(ProjectKnowledgeRefreshOutcomeSchema.parse('updated')).toBe('updated');
    expect(ProjectKnowledgeRefreshOutcomeSchema.parse('cleared')).toBe('cleared');
    expect(ProjectKnowledgeRefreshOutcomeSchema.parse('skipped_no_change')).toBe(
      'skipped_no_change',
    );
    expect(ProjectKnowledgeRefreshOutcomeSchema.parse('failed')).toBe('failed');
  });
});
