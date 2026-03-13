import { describe, expect, it } from 'vitest';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440901';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440902';
const NODE_A = '550e8400-e29b-41d4-a716-446655440903';
const NODE_B = '550e8400-e29b-41d4-a716-446655440904';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440905';

const projectConfig = {
  id: PROJECT_ID,
  name: 'Projects UI Runtime',
  type: 'hybrid' as const,
  pfcTier: 3,
  memoryAccessPolicy: {
    canReadFrom: 'all' as const,
    canBeReadBy: 'all' as const,
    inheritsGlobal: true,
  },
  escalationChannels: ['in-app' as const],
  workflow: {
    defaultWorkflowDefinitionId: WORKFLOW_ID,
    definitions: [
      {
        id: WORKFLOW_ID,
        projectId: PROJECT_ID,
        mode: 'hybrid' as const,
        version: '1.0.0',
        name: 'Projects Runtime Workflow',
        entryNodeIds: [NODE_A],
        nodes: [
          {
            id: NODE_A,
            name: 'Draft',
            type: 'model-call' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'model-call' as const,
              modelRole: 'reasoner' as const,
              promptRef: 'prompt://draft',
              outputSchemaRef: 'schema://node-output/draft',
            },
          },
          {
            id: NODE_B,
            name: 'Review',
            type: 'quality-gate' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'quality-gate' as const,
              evaluatorRef: 'evaluator://quality',
              passThresholdRef: 'threshold://default',
              failureAction: 'block' as const,
            },
          },
        ],
        edges: [
          {
            id: '550e8400-e29b-41d4-a716-446655440906',
            from: NODE_A,
            to: NODE_B,
            priority: 0,
          },
        ],
      },
    ],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-09T00:00:00.000Z',
  updatedAt: '2026-03-09T00:00:00.000Z',
};

describe('Phase 9.5 Projects UI runtime integration', () => {
  it('exposes in-process run state and graphs for the Projects UI surface', async () => {
    const engine = new DeterministicWorkflowEngine();

    const started = await engine.start({
      projectConfig: projectConfig as any,
      runId: RUN_ID as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
      startedAt: '2026-03-09T00:00:00.000Z',
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    const graph = await engine.getRunGraph(started.runState.runId);
    const runs = await engine.listProjectRuns(PROJECT_ID as any);

    expect(graph?.workflowDefinitionId).toBe(WORKFLOW_ID);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.activeNodeIds).toEqual([NODE_A]);

    const completed = await engine.completeNode(started.runState.runId, NODE_A as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:a'],
    });
    expect(completed.readyNodeIds).toEqual([NODE_B]);
  });
});
