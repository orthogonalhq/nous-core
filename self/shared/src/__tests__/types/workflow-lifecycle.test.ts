import { describe, expect, it } from 'vitest';
import {
  WorkflowLifecycleCancelCommandSchema,
  WorkflowLifecycleDefinitionSummarySchema,
  WorkflowLifecycleInspectQuerySchema,
  WorkflowLifecycleListQuerySchema,
  WorkflowLifecycleMutationResultSchema,
  WorkflowLifecyclePauseCommandSchema,
  WorkflowLifecycleStartCommandSchema,
  WorkflowLifecycleStatusResultSchema,
} from '../../types/workflow-lifecycle.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440601';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440602';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440603';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440604';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440605';
const NOW = '2026-03-16T20:00:00.000Z';

describe('Workflow lifecycle schemas', () => {
  it('applies defaults for list, pause, and cancel requests', () => {
    expect(
      WorkflowLifecycleListQuerySchema.parse({
        projectId: PROJECT_ID,
      }),
    ).toEqual({
      projectId: PROJECT_ID,
      status: [],
      definition: undefined,
      includeInstalledDefinitions: true,
      includeActiveInstances: true,
    });

    expect(
      WorkflowLifecyclePauseCommandSchema.parse({
        runId: RUN_ID,
      }).reasonCode,
    ).toBe('workflow_paused');

    expect(
      WorkflowLifecycleCancelCommandSchema.parse({
        runId: RUN_ID,
      }).reasonCode,
    ).toBe('workflow_canceled');
  });

  it('accepts canonical inspect, start, mutation, and status payloads', () => {
    expect(
      WorkflowLifecycleDefinitionSummarySchema.parse({
        packageId: 'workflow.research',
        packageVersion: '2.0.0',
        name: 'research-workflow',
        description: 'Workflow package manifest.',
        entrypoint: 'draft-node',
        entrypoints: ['draft-node'],
        skillDependencies: [],
        toolDependencies: [],
        rootRef: '.workflows/workflow__research',
        manifestRef: '.workflows/workflow__research/workflow.md',
      }).flowRef,
    ).toBeUndefined();

    expect(
      WorkflowLifecycleInspectQuerySchema.parse({
        packageId: 'a-soul-is-born',
      }).packageId,
    ).toBe('a-soul-is-born');

    expect(
      WorkflowLifecycleStartCommandSchema.parse({
        definition: 'a-soul-is-born',
        projectId: PROJECT_ID,
      }),
    ).toMatchObject({
      definition: 'a-soul-is-born',
      projectId: PROJECT_ID,
      config: {},
    });

    expect(
      WorkflowLifecycleMutationResultSchema.parse({
        run: {
          runId: RUN_ID,
          projectId: PROJECT_ID,
          workflowDefinitionId: WORKFLOW_ID,
          definitionName: 'a-soul-is-born',
          status: 'running',
          activeNodeIds: [NODE_ID],
          waitingNodeIds: [],
          blockedNodeIds: [],
          checkpointState: 'idle',
          startedAt: NOW,
          updatedAt: NOW,
        },
      }).warnings,
    ).toEqual([]);

    expect(
      WorkflowLifecycleStatusResultSchema.parse({
        run: {
          runId: RUN_ID,
          projectId: PROJECT_ID,
          workflowDefinitionId: WORKFLOW_ID,
          definitionName: 'a-soul-is-born',
          status: 'running',
          activeNodeIds: [NODE_ID],
          waitingNodeIds: [],
          blockedNodeIds: [],
          checkpointState: 'idle',
          startedAt: NOW,
          updatedAt: NOW,
        },
        readyNodeIds: [NODE_ID],
        completedNodeIds: [],
        activatedEdgeIds: [EDGE_ID],
        checkpointState: 'idle',
        governanceGateHits: ['workflow_admitted'],
      }).run.workflowDefinitionId,
    ).toBe(WORKFLOW_ID);
  });

  it('fails closed on malformed requests and invalid mutation payloads', () => {
    expect(
      WorkflowLifecycleStartCommandSchema.safeParse({
        definition: '',
        projectId: PROJECT_ID,
      }).success,
    ).toBe(false);

    expect(
      WorkflowLifecycleMutationResultSchema.safeParse({
        run: {
          runId: RUN_ID,
          projectId: PROJECT_ID,
          workflowDefinitionId: WORKFLOW_ID,
          definitionName: 'a-soul-is-born',
          status: 'running',
          activeNodeIds: [],
          waitingNodeIds: [],
          blockedNodeIds: [],
          checkpointState: 'idle',
          startedAt: NOW,
        },
      }).success,
    ).toBe(false);
  });
});
