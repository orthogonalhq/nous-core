import { describe, expect, it } from 'vitest';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440901';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440902';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440903';
const NODE_A = '550e8400-e29b-41d4-a716-446655440904';
const TRIGGER_ID = '550e8400-e29b-41d4-a716-446655440905';

const projectConfig = {
  id: PROJECT_ID,
  name: 'Trigger Provenance Project',
  type: 'hybrid' as const,
  pfcTier: 2,
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
        name: 'Trigger Provenance Workflow',
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
            },
          },
        ],
        edges: [],
      },
    ],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
} as const;

describe('Phase 9.3 trigger provenance integration', () => {
  it('persists ingress-derived trigger context on the canonical workflow run state', async () => {
    const engine = new DeterministicWorkflowEngine();
    const started = await engine.start({
      projectConfig: projectConfig as any,
      runId: RUN_ID as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
      triggerContext: {
        triggerId: TRIGGER_ID,
        triggerType: 'system_event',
        sourceId: 'scheduler://nightly',
        workflowRef: WORKFLOW_ID,
        workmodeId: 'system:implementation',
        idempotencyKey: 'nightly:2026-03-08T00:00:00.000Z',
        dispatchRef: `dispatch:${RUN_ID}`,
        evidenceRef: `evidence:${TRIGGER_ID}`,
        occurredAt: '2026-03-08T00:00:00.000Z',
      },
      admissionEvidenceRefs: ['ingress://dispatch'],
      startedAt: '2026-03-08T00:00:01.000Z',
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    expect(started.runState.runId).toBe(RUN_ID);
    expect(started.runState.triggerContext).toEqual({
      triggerId: TRIGGER_ID,
      triggerType: 'system_event',
      sourceId: 'scheduler://nightly',
      workflowRef: WORKFLOW_ID,
      workmodeId: 'system:implementation',
      idempotencyKey: 'nightly:2026-03-08T00:00:00.000Z',
      dispatchRef: `dispatch:${RUN_ID}`,
      evidenceRef: `evidence:${TRIGGER_ID}`,
      occurredAt: '2026-03-08T00:00:00.000Z',
    });

    const stored = await engine.getState(RUN_ID as any);
    expect(stored?.triggerContext?.dispatchRef).toBe(`dispatch:${RUN_ID}`);
  });
});
