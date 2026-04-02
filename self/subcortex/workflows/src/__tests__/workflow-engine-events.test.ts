import { describe, it, expect, vi } from 'vitest';
import type { IEventBus } from '@nous/shared';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440501';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440502';
const NODE_A = '550e8400-e29b-41d4-a716-446655440503';
const NODE_B = '550e8400-e29b-41d4-a716-446655440504';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440508';

const projectConfig = {
  id: PROJECT_ID,
  name: 'Event Test Project',
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
        name: 'Event Test Workflow',
        entryNodeIds: [NODE_A],
        nodes: [
          {
            id: NODE_A,
            name: 'Step A',
            type: 'model-call' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'model-call' as const,
              modelRole: 'reasoner' as const,
              promptRef: 'prompt://a',
              outputSchemaRef: 'schema://node-output/a',
            },
          },
          {
            id: NODE_B,
            name: 'Step B',
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
            id: '550e8400-e29b-41d4-a716-446655440507',
            from: NODE_A,
            to: NODE_B,
            priority: 0,
          },
        ],
      },
    ],
    packageBindings: [],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
} as const;

function createMockEventBus(): IEventBus & { publish: ReturnType<typeof vi.fn> } {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(() => 'sub-id'),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
  };
}

async function startWorkflow(engine: DeterministicWorkflowEngine) {
  const result = await engine.start({
    projectConfig: projectConfig as any,
    runId: RUN_ID as any,
    workmodeId: 'system:implementation',
    sourceActor: 'orchestration_agent',
    controlState: 'running',
  });
  if (result.status !== 'started') {
    throw new Error(`Unexpected start status: ${result.status}`);
  }
  return result;
}

describe('DeterministicWorkflowEngine — event emission', () => {
  describe('completeNode emissions', () => {
    it('publishes workflow:node-status-changed with status completed when completeNode is called', async () => {
      const eventBus = createMockEventBus();
      const engine = new DeterministicWorkflowEngine({ eventBus });
      const started = await startWorkflow(engine);

      await engine.completeNode(started.runState.runId, NODE_A as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:a'],
      });

      const nodeStatusCalls = eventBus.publish.mock.calls.filter(
        (call) => call[0] === 'workflow:node-status-changed',
      );
      expect(nodeStatusCalls.length).toBeGreaterThanOrEqual(1);
      expect(nodeStatusCalls[0][1]).toMatchObject({
        workflowRunId: RUN_ID,
        nodeId: NODE_A,
        projectId: PROJECT_ID,
        status: 'completed',
      });
      expect(nodeStatusCalls[0][1].emittedAt).toBeDefined();
    });

    it('publishes workflow:run-completed when completeNode produces terminal state', async () => {
      const eventBus = createMockEventBus();
      const engine = new DeterministicWorkflowEngine({ eventBus });
      const started = await startWorkflow(engine);

      await engine.completeNode(started.runState.runId, NODE_A as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:a'],
      });
      await engine.completeNode(started.runState.runId, NODE_B as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:b'],
      });

      const runCompletedCalls = eventBus.publish.mock.calls.filter(
        (call) => call[0] === 'workflow:run-completed',
      );
      expect(runCompletedCalls.length).toBe(1);
      expect(runCompletedCalls[0][1]).toMatchObject({
        workflowRunId: RUN_ID,
        projectId: PROJECT_ID,
        outcome: 'completed',
      });
    });
  });

  describe('cancel emissions', () => {
    it('publishes workflow:run-completed with outcome cancelled when cancel is called', async () => {
      const eventBus = createMockEventBus();
      const engine = new DeterministicWorkflowEngine({ eventBus });
      const started = await startWorkflow(engine);

      await engine.cancel(started.runState.runId, {
        reasonCode: 'workflow_canceled',
        evidenceRefs: ['test:cancel'],
      });

      const runCompletedCalls = eventBus.publish.mock.calls.filter(
        (call) => call[0] === 'workflow:run-completed',
      );
      expect(runCompletedCalls.length).toBe(1);
      expect(runCompletedCalls[0][1]).toMatchObject({
        workflowRunId: RUN_ID,
        projectId: PROJECT_ID,
        outcome: 'cancelled',
      });
    });
  });

  describe('optional dependency', () => {
    it('does NOT publish events when eventBus is not provided', async () => {
      const engine = new DeterministicWorkflowEngine();
      const started = await startWorkflow(engine);

      // Should not throw when eventBus is missing
      await engine.completeNode(started.runState.runId, NODE_A as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:a'],
      });

      await engine.completeNode(started.runState.runId, NODE_B as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:b'],
      });

      // No eventBus means no publish calls — engine works identically
      const state = await engine.getState(started.runState.runId);
      expect(state?.status).toBe('completed');
    });
  });

  describe('fire-and-forget semantics', () => {
    it('continues execution normally if eventBus.publish throws', async () => {
      const eventBus = createMockEventBus();
      eventBus.publish.mockImplementation(() => {
        throw new Error('Simulated subscriber crash');
      });
      const engine = new DeterministicWorkflowEngine({ eventBus });
      const started = await startWorkflow(engine);

      // Should not throw despite eventBus.publish throwing
      const afterComplete = await engine.completeNode(started.runState.runId, NODE_A as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:a'],
      });

      expect(afterComplete.nodeStates[NODE_A]?.status).toBe('completed');
    });
  });

  describe('edge cases', () => {
    it('does not emit duplicate run-completed when previous status was already terminal', async () => {
      const eventBus = createMockEventBus();
      const engine = new DeterministicWorkflowEngine({ eventBus });
      const started = await startWorkflow(engine);

      // Complete both nodes to reach terminal state
      await engine.completeNode(started.runState.runId, NODE_A as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:a'],
      });
      await engine.completeNode(started.runState.runId, NODE_B as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:b'],
      });

      const runCompletedCalls = eventBus.publish.mock.calls.filter(
        (call) => call[0] === 'workflow:run-completed',
      );
      // Should only emit once when transitioning TO terminal, not on every subsequent operation
      expect(runCompletedCalls.length).toBe(1);
    });

    it('emission payloads contain correct projectId from WorkflowRunState', async () => {
      const eventBus = createMockEventBus();
      const engine = new DeterministicWorkflowEngine({ eventBus });
      const started = await startWorkflow(engine);

      await engine.completeNode(started.runState.runId, NODE_A as any, {
        reasonCode: 'node_completed',
        evidenceRefs: ['test:complete:a'],
      });

      const nodeStatusCalls = eventBus.publish.mock.calls.filter(
        (call) => call[0] === 'workflow:node-status-changed',
      );
      for (const call of nodeStatusCalls) {
        expect(call[1].projectId).toBe(PROJECT_ID);
      }
    });

    it('outcome mapping correctly converts internal canceled to external cancelled', async () => {
      const eventBus = createMockEventBus();
      const engine = new DeterministicWorkflowEngine({ eventBus });
      const started = await startWorkflow(engine);

      await engine.cancel(started.runState.runId, {
        reasonCode: 'workflow_canceled',
        evidenceRefs: ['test:cancel'],
      });

      const runCompletedCalls = eventBus.publish.mock.calls.filter(
        (call) => call[0] === 'workflow:run-completed',
      );
      // Internal status is 'canceled' but event payload uses 'cancelled'
      expect(runCompletedCalls[0][1].outcome).toBe('cancelled');
    });
  });
});
