import { describe, it, expect } from 'vitest';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440501';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440502';
const NODE_A = '550e8400-e29b-41d4-a716-446655440503';
const NODE_B = '550e8400-e29b-41d4-a716-446655440504';

const projectConfig = {
  id: PROJECT_ID,
  name: 'Engine Project',
  type: 'hybrid' as const,
  pfcTier: 2,
  modelAssignments: undefined,
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
        name: 'Engine Workflow',
        entryNodeIds: [NODE_A],
        nodes: [
          {
            id: NODE_A,
            name: 'Draft',
            type: 'model-call' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {},
          },
          {
            id: NODE_B,
            name: 'Review',
            type: 'quality-gate' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {},
          },
        ],
        edges: [
          {
            id: '550e8400-e29b-41d4-a716-446655440505',
            from: NODE_A,
            to: NODE_B,
            priority: 0,
          },
        ],
      },
    ],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
} as any;

describe('DeterministicWorkflowEngine', () => {
  it('blocks start when control state disallows admission', async () => {
    const engine = new DeterministicWorkflowEngine();
    const result = await engine.start({
      projectConfig,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'hard_stopped',
    });

    expect(result.status).toBe('admission_blocked');
    if (result.status === 'admission_blocked') {
      expect(result.admission.reasonCode).toBe('POL-CONTROL-STATE-BLOCKED');
    }
  });

  it('starts, persists, and advances workflow state', async () => {
    const engine = new DeterministicWorkflowEngine();
    const started = await engine.start({
      projectConfig,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    const runId = started.runState.runId;
    const paused = await engine.pause(runId, {
      reasonCode: 'workflow_paused',
      evidenceRefs: ['workflow:pause'],
    });
    expect(paused.status).toBe('paused');

    const resumed = await engine.resume(runId, {
      reasonCode: 'workflow_resumed',
      evidenceRefs: ['workflow:resume'],
    });
    expect(resumed.status).toBe('running');

    const afterFirstNode = await engine.completeNode(runId, NODE_A as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:a'],
    });
    expect(afterFirstNode.readyNodeIds).toEqual([NODE_B]);

    const afterSecondNode = await engine.completeNode(runId, NODE_B as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:b'],
    });
    expect(afterSecondNode.status).toBe('completed');

    const current = await engine.getState(runId);
    expect(current?.status).toBe('completed');
  });
});
