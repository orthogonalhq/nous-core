import { describe, expect, it, vi } from 'vitest';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440901';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440902';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440903';

const projectConfig = {
  id: PROJECT_ID,
  name: 'Knowledge Tool Workflow',
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
        name: 'Knowledge Tool Workflow',
        entryNodeIds: [NODE_ID],
        nodes: [
          {
            id: NODE_ID,
            name: 'Refresh knowledge',
            type: 'tool-execution' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'tool-execution' as const,
              toolName: 'refresh_project_knowledge',
              inputMappingRef: 'mapping://refresh',
              resultSchemaRef: 'schema://node-output/refresh',
            },
          },
        ],
        edges: [],
      },
    ],
    packageBindings: [],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-09T16:30:00.000Z',
  updatedAt: '2026-03-09T16:30:00.000Z',
} as const;

describe('Phase 9.4 knowledge tool workflow integration', () => {
  it('passes workflow lineage into refresh tool execution without widening the shared tool interface', async () => {
    const toolExecutor = {
      execute: vi.fn(async () => ({
        success: true,
        output: { refreshed: true },
        durationMs: 3,
      })),
    };
    const engine = new DeterministicWorkflowEngine({
      pfcEngine: {
        evaluateConfidenceGovernance: vi.fn(async () => ({
          outcome: 'allow_with_flag',
          reasonCode: 'CGR-ALLOW-WITH-FLAG',
          governance: 'must',
          actionCategory: 'tool-execute',
          projectControlState: 'running',
          patternId: '550e8400-e29b-41d4-a716-446655440904',
          confidence: 0.95,
          confidenceTier: 'high',
          supportingSignals: 20,
          decayState: 'stable',
          autonomyAllowed: false,
          requiresConfirmation: false,
          highRiskOverrideApplied: false,
          evidenceRefs: [{ actionCategory: 'tool-execute' }],
          explanation: {
            patternId: '550e8400-e29b-41d4-a716-446655440904',
            outcomeRef: 'workflow:refresh',
            evidenceRefs: [{ actionCategory: 'tool-execute' }],
          },
        })),
      } as any,
      toolExecutor: toolExecutor as any,
    });

    const started = await engine.start({
      projectConfig: projectConfig as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    await engine.executeReadyNode({
      executionId: started.runState.runId,
      nodeDefinitionId: NODE_ID as any,
      controlState: 'running',
      payload: {
        toolParams: {
          projectId: PROJECT_ID,
        },
        detail: {},
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:refresh'],
      },
    });

    const calls = vi.mocked(toolExecutor.execute).mock.calls;
    expect(calls).toHaveLength(1);
    const firstCall = calls.at(0) as [string, unknown, string?] | undefined;
    expect(firstCall?.[0]).toBe('refresh_project_knowledge');
    expect(firstCall?.[1]).toEqual(
      expect.objectContaining({
        projectId: PROJECT_ID,
        trigger: 'workflow',
        reasonCode: 'workflow_tool_refresh',
        workflowRunId: started.runState.runId,
        dispatchLineageId: expect.any(String),
      }),
    );
  });
});
