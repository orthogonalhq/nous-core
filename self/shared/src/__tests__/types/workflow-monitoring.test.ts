import { describe, expect, it } from 'vitest';
import {
  ProjectWorkflowSurfaceSnapshotSchema,
  SaveWorkflowDefinitionInputSchema,
  WorkflowDefinitionValidationResultSchema,
  WorkflowNodeInspectProjectionSchema,
  WorkflowNodeMonitorProjectionSchema,
  WorkflowStageProjectionSchema,
  WorkflowRuntimeAvailabilitySchema,
  WorkflowVisualDebugSnapshotSchema,
  WorkflowSurfaceLinkSchema,
  WorkflowTraceSummarySchema,
} from '../../types/workflow-monitoring.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655449001';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655449002';
const RUN_ID = '550e8400-e29b-41d4-a716-446655449003';
const NODE_ID = '550e8400-e29b-41d4-a716-446655449004';
const LINEAGE_ID = '550e8400-e29b-41d4-a716-446655449005';
const TRACE_ID = '550e8400-e29b-41d4-a716-446655449006';
const DIGEST =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const NOW = '2026-03-09T19:00:00.000Z';

const definition = {
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid',
  version: '1.0.0',
  name: 'Projects UI Workflow',
  entryNodeIds: [NODE_ID],
  nodes: [
    {
      id: NODE_ID,
      name: 'Draft',
      type: 'model-call',
      governance: 'must',
      executionModel: 'synchronous',
      config: {
        type: 'model-call',
        modelRole: 'reasoner',
        promptRef: 'prompt://draft',
      },
    },
  ],
  edges: [],
} as const;

const graph = {
  workflowDefinitionId: WORKFLOW_ID,
  projectId: PROJECT_ID,
  version: '1.0.0',
  graphDigest: DIGEST,
  entryNodeIds: [NODE_ID],
  topologicalOrder: [NODE_ID],
  nodes: {
    [NODE_ID]: {
      definition: definition.nodes[0],
      inboundEdgeIds: [],
      outboundEdgeIds: [],
      topologicalIndex: 0,
    },
  },
  edges: {},
};

const runState = {
  runId: RUN_ID,
  workflowDefinitionId: WORKFLOW_ID,
  projectId: PROJECT_ID,
  workflowVersion: '1.0.0',
  graphDigest: DIGEST,
  status: 'ready',
  admission: {
    allowed: true,
    reasonCode: 'workflow_admitted',
    evidenceRefs: ['workflow:admission'],
  },
  activeNodeIds: [NODE_ID],
  activatedEdgeIds: [],
  readyNodeIds: [NODE_ID],
  waitingNodeIds: [],
  blockedNodeIds: [],
  completedNodeIds: [],
  checkpointState: 'idle',
  nodeStates: {
    [NODE_ID]: {
      id: '550e8400-e29b-41d4-a716-446655449007',
      nodeDefinitionId: NODE_ID,
      status: 'ready',
      attempts: [],
      activeAttempt: null,
      correctionArcs: [],
      evidenceRefs: [],
      updatedAt: NOW,
    },
  },
  dispatchLineage: [],
  startedAt: NOW,
  updatedAt: NOW,
};

describe('WorkflowRuntimeAvailabilitySchema', () => {
  it('accepts bounded single-process runtime states', () => {
    expect(WorkflowRuntimeAvailabilitySchema.parse('live')).toBe('live');
    expect(WorkflowRuntimeAvailabilitySchema.parse('no_active_run')).toBe(
      'no_active_run',
    );
    expect(
      WorkflowRuntimeAvailabilitySchema.parse('degraded_runtime_unavailable'),
    ).toBe('degraded_runtime_unavailable');
  });
});

describe('WorkflowSurfaceLinkSchema', () => {
  it('accepts canonical deep-link references', () => {
    const parsed = WorkflowSurfaceLinkSchema.parse({
      target: 'projects',
      projectId: PROJECT_ID,
      workflowRunId: RUN_ID,
      nodeDefinitionId: NODE_ID,
      dispatchLineageId: LINEAGE_ID,
      evidenceRef: 'evidence://workflow-node',
    });

    expect(parsed.workflowRunId).toBe(RUN_ID);
    expect(parsed.target).toBe('projects');
  });
});

describe('WorkflowTraceSummarySchema', () => {
  it('accepts compact trace summaries for projection use', () => {
    const parsed = WorkflowTraceSummarySchema.parse({
      traceId: TRACE_ID,
      startedAt: NOW,
      completedAt: NOW,
      turnCount: 2,
    });

    expect(parsed.turnCount).toBe(2);
  });
});

describe('WorkflowNodeMonitorProjectionSchema', () => {
  it('accepts node-level monitoring projections', () => {
    const parsed = WorkflowNodeMonitorProjectionSchema.parse({
      nodeDefinitionId: NODE_ID,
      definition: definition.nodes[0],
      nodeState: runState.nodeStates[NODE_ID],
      status: 'ready',
      groupKey: 'status:ready',
      artifactRefs: ['artifact://draft/v1'],
      traceIds: [TRACE_ID],
      deepLinks: [
        {
          target: 'traces',
          projectId: PROJECT_ID,
          workflowRunId: RUN_ID,
          nodeDefinitionId: NODE_ID,
          traceId: TRACE_ID,
        },
      ],
    });

    expect(parsed.deepLinks[0]?.traceId).toBe(TRACE_ID);
  });
});

describe('WorkflowStageProjectionSchema', () => {
  it('accepts deterministic stage projections', () => {
    const parsed = WorkflowStageProjectionSchema.parse({
      id: 'stage-0',
      index: 0,
      label: 'Entry',
      nodeDefinitionIds: [NODE_ID],
      kind: 'entry',
    });

    expect(parsed.kind).toBe('entry');
  });
});

describe('ProjectWorkflowSurfaceSnapshotSchema', () => {
  it('accepts workflow surface snapshots with explicit degraded diagnostics', () => {
    const parsed = ProjectWorkflowSurfaceSnapshotSchema.parse({
      project: {
        id: PROJECT_ID,
        name: 'Projects UI Project',
        type: 'hybrid',
      },
      workflowDefinition: definition,
      graph,
      runtimeAvailability: 'live',
      selectedRunId: RUN_ID,
      activeRunState: runState,
      recentRuns: [runState],
      nodeProjections: [
        {
          nodeDefinitionId: NODE_ID,
          definition: definition.nodes[0],
          nodeState: runState.nodeStates[NODE_ID],
          status: 'ready',
          groupKey: 'status:ready',
          artifactRefs: [],
          traceIds: [],
          deepLinks: [],
        },
      ],
      recentArtifacts: [],
      recentTraces: [],
      controlProjection: null,
      diagnostics: {
        runtimePosture: 'single_process_local',
        inspectFirstMode: 'hybrid',
      },
    });

    expect(parsed.runtimeAvailability).toBe('live');
    expect(parsed.diagnostics.runtimePosture).toBe('single_process_local');
  });
});

describe('WorkflowVisualDebugSnapshotSchema', () => {
  it('accepts advanced visual-debug snapshots with parity diagnostics', () => {
    const parsed = WorkflowVisualDebugSnapshotSchema.parse({
      project: {
        id: PROJECT_ID,
        name: 'Projects UI Project',
        type: 'hybrid',
      },
      workflowDefinition: definition,
      graph,
      runtimeAvailability: 'live',
      selectedRunId: RUN_ID,
      activeRunState: runState,
      recentRuns: [runState],
      nodeProjections: [
        {
          nodeDefinitionId: NODE_ID,
          definition: definition.nodes[0],
          nodeState: runState.nodeStates[NODE_ID],
          status: 'ready',
          groupKey: 'status:ready',
          artifactRefs: [],
          traceIds: [],
          deepLinks: [],
        },
      ],
      stages: [
        {
          id: 'stage-0',
          index: 0,
          label: 'Entry',
          nodeDefinitionIds: [NODE_ID],
          kind: 'entry',
        },
      ],
      canvasNodes: [
        {
          nodeDefinitionId: NODE_ID,
          definition: definition.nodes[0],
          stageId: 'stage-0',
          column: 0,
          row: 0,
          status: 'ready',
          isEntry: true,
          isActive: true,
          latestAttemptStatus: 'ready',
          latestReasonCode: 'workflow_ready',
          artifactCount: 0,
          traceCount: 0,
          deepLinks: [],
        },
      ],
      canvasEdges: [],
      maoRunGraph: {
        projectId: PROJECT_ID,
        workflowRunId: RUN_ID,
        nodes: [],
        edges: [],
        generatedAt: NOW,
      },
      controlProjection: null,
      checkpointSummary: {
        runCheckpointState: 'idle',
      },
      schedulerSummary: {
        triggerContext: null,
        enabledScheduleCount: 1,
        overdueScheduleCount: 0,
        evidenceRefs: ['schedule:primary'],
      },
      recentArtifacts: [],
      recentTraces: [],
      diagnostics: {
        runtimePosture: 'single_process_local',
        inspectFirstMode: 'hybrid',
        graphProjectionParity: 'aligned',
      },
    });

    expect(parsed.diagnostics.graphProjectionParity).toBe('aligned');
    expect(parsed.stages).toHaveLength(1);
  });
});

describe('WorkflowNodeInspectProjectionSchema', () => {
  it('accepts node inspect projections with MAO reuse and checkpoint summaries', () => {
    const parsed = WorkflowNodeInspectProjectionSchema.parse({
      nodeDefinitionId: NODE_ID,
      monitor: {
        nodeDefinitionId: NODE_ID,
        definition: definition.nodes[0],
        nodeState: runState.nodeStates[NODE_ID],
        status: 'ready',
        groupKey: 'status:ready',
        artifactRefs: ['artifact://draft/v1'],
        traceIds: [TRACE_ID],
        deepLinks: [],
      },
      maoInspect: null,
      checkpointSummary: {
        runCheckpointState: 'idle',
      },
      artifactRefs: ['artifact://draft/v1'],
      traceIds: [TRACE_ID],
      policyReasonCode: 'workflow_admitted',
    });

    expect(parsed.policyReasonCode).toBe('workflow_admitted');
    expect(parsed.traceIds[0]).toBe(TRACE_ID);
  });
});

describe('WorkflowDefinitionValidationResultSchema', () => {
  it('accepts validation results with structured issues', () => {
    const parsed = WorkflowDefinitionValidationResultSchema.parse({
      valid: false,
      definition: null,
      derivedGraph: null,
      issues: [
        {
          severity: 'error',
          code: 'workflow_definition_invalid',
          message: 'Entry node is missing',
          path: ['entryNodeIds', '0'],
        },
      ],
    });

    expect(parsed.issues[0]?.severity).toBe('error');
  });
});

describe('SaveWorkflowDefinitionInputSchema', () => {
  it('accepts canonical workflow save input', () => {
    const parsed = SaveWorkflowDefinitionInputSchema.parse({
      projectId: PROJECT_ID,
      workflowDefinition: definition,
      setAsDefault: true,
    });

    expect(parsed.workflowDefinition.id).toBe(WORKFLOW_ID);
  });
});
