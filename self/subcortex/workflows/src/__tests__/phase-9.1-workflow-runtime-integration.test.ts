import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { DocumentProjectStore } from '@nous/subcortex-projects';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440601';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440602';
const NODE_A = '550e8400-e29b-41d4-a716-446655440603';
const NODE_B = '550e8400-e29b-41d4-a716-446655440604';

describe('Phase 9.1 workflow runtime integration', () => {
  let tempDir: string;
  let documentStore: SqliteDocumentStore;
  let projectStore: DocumentProjectStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nous-workflows-'));
    documentStore = new SqliteDocumentStore(join(tempDir, 'workflow.db'));
    projectStore = new DocumentProjectStore(documentStore);
  });

  afterEach(() => {
    documentStore.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('starts from project-stored workflow truth and completes deterministically', async () => {
    await projectStore.create({
      id: PROJECT_ID as any,
      name: 'Integrated Project',
      type: 'hybrid',
      pfcTier: 2,
      memoryAccessPolicy: {
        canReadFrom: 'all',
        canBeReadBy: 'all',
        inheritsGlobal: true,
      },
      escalationChannels: ['in-app'],
      workflow: {
        defaultWorkflowDefinitionId: WORKFLOW_ID as any,
        definitions: [
          {
            id: WORKFLOW_ID as any,
            projectId: PROJECT_ID as any,
            mode: 'hybrid',
            version: '1.0.0',
            name: 'Integrated Workflow',
            entryNodeIds: [NODE_A as any],
            nodes: [
              {
                id: NODE_A as any,
                name: 'Draft',
                type: 'model-call',
                governance: 'must',
                executionModel: 'synchronous',
                config: {},
              },
              {
                id: NODE_B as any,
                name: 'Review',
                type: 'quality-gate',
                governance: 'must',
                executionModel: 'synchronous',
                config: {},
              },
            ],
            edges: [
              {
                id: '550e8400-e29b-41d4-a716-446655440605' as any,
                from: NODE_A as any,
                to: NODE_B as any,
                priority: 0,
              },
            ],
          },
        ],
      },
      retrievalBudgetTokens: 500,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    } as any);

    const projectConfig = await projectStore.get(PROJECT_ID as any);
    expect(projectConfig).not.toBeNull();

    const engine = new DeterministicWorkflowEngine();
    const started = await engine.start({
      projectConfig: projectConfig!,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    expect(started.graph.graphDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(started.runState.readyNodeIds).toEqual([NODE_A]);

    const afterFirstNode = await engine.completeNode(
      started.runState.runId,
      NODE_A as any,
      {
        reasonCode: 'node_completed',
        evidenceRefs: ['workflow:complete:a'],
      },
    );
    expect(afterFirstNode.readyNodeIds).toEqual([NODE_B]);

    const completed = await engine.completeNode(started.runState.runId, NODE_B as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:b'],
    });
    expect(completed.status).toBe('completed');
    expect(completed.dispatchLineage).toHaveLength(2);
  });
});
