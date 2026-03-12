import { describe, expect, it, vi } from 'vitest';
import {
  createInternalMcpSurfaceBundle,
} from '../../internal-mcp/index.js';
import {
  AGENT_ID,
  PROJECT_ID,
  RUN_ID,
  TRACE_ID,
  createWorkmodeAdmissionGuard,
  createWorkflowEngine,
} from '../agent-gateway/helpers.js';

describe('Internal MCP lifecycle handlers', () => {
  it('rejects dispatch_agent when workmode admission denies the dispatch', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard({
          evaluateDispatchAdmission: vi.fn().mockReturnValue({
            allowed: false,
            reasonCode: 'WMODE-010',
            evidenceRefs: ['blocked'],
          }),
        }),
        dispatchRuntime: {
          dispatchChild: vi.fn(),
        },
      },
    });

    await expect(
      bundle.lifecycleHooks.dispatchAgent!(
        {
          targetClass: 'Worker',
          taskInstructions: 'Do work',
        },
        {
          agentId: AGENT_ID,
          agentClass: 'Orchestrator',
          correlation: {
            runId: RUN_ID,
            parentId: AGENT_ID,
            sequence: 0,
          },
          usage: {
            turnsUsed: 0,
            tokensUsed: 0,
            elapsedMs: 0,
            spawnUnitsUsed: 0,
          },
          execution: {
            projectId: PROJECT_ID,
            traceId: TRACE_ID,
            workmodeId: 'system:implementation',
          },
          snapshot: {
            agentId: AGENT_ID,
            agentClass: 'Orchestrator',
            correlation: {
              runId: RUN_ID,
              parentId: AGENT_ID,
              sequence: 0,
            },
            budget: {
              maxTurns: 3,
              maxTokens: 100,
              timeoutMs: 1000,
            },
            usage: {
              turnsUsed: 0,
              tokensUsed: 0,
              elapsedMs: 0,
              spawnUnitsUsed: 0,
            },
            startedAt: '2026-03-12T19:00:00.000Z',
            lastUpdatedAt: '2026-03-12T19:00:00.000Z',
            contextFrameCount: 0,
            execution: {
              projectId: PROJECT_ID,
              traceId: TRACE_ID,
              workmodeId: 'system:implementation',
            },
          },
        },
      ),
    ).rejects.toThrow('WMODE-010');
  });

  it('validates graph-scoped task_complete output before completing the node', async () => {
    const completeNode = vi.fn().mockResolvedValue({});
    const workflowEngine = createWorkflowEngine({
      getRunGraph: vi.fn().mockResolvedValue({
        workflowDefinitionId: '550e8400-e29b-41d4-a716-446655440160',
        projectId: PROJECT_ID,
        version: '1',
        graphDigest: 'a'.repeat(64),
        entryNodeIds: ['550e8400-e29b-41d4-a716-446655440161'],
        topologicalOrder: ['550e8400-e29b-41d4-a716-446655440161'],
        nodes: {
          '550e8400-e29b-41d4-a716-446655440161': {
            definition: {
              id: '550e8400-e29b-41d4-a716-446655440161',
              name: 'Complete',
              type: 'model-call',
              governance: 'must',
              executionModel: 'sync',
              config: {
                type: 'model-call',
                modelRole: 'reasoner',
                promptRef: 'prompt://complete',
                outputSchemaRef: 'schema://completion',
              },
            },
            inboundEdgeIds: [],
            outboundEdgeIds: [],
            topologicalIndex: 0,
          },
        },
        edges: {},
      }),
      completeNode,
    });
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        workflowEngine,
        outputSchemaValidator: {
          validate: vi.fn().mockResolvedValue({ success: true }),
        },
      },
    });

    const result = await bundle.lifecycleHooks.taskComplete!(
      {
        output: { done: true },
        artifactRefs: ['artifact-1'],
        summary: 'finished',
      },
      {
        agentId: AGENT_ID,
        agentClass: 'Worker',
        correlation: {
          runId: RUN_ID,
          parentId: AGENT_ID,
          sequence: 1,
        },
        usage: {
          turnsUsed: 1,
          tokensUsed: 10,
          elapsedMs: 50,
          spawnUnitsUsed: 0,
        },
        execution: {
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          executionId: '550e8400-e29b-41d4-a716-446655440170',
          nodeDefinitionId: '550e8400-e29b-41d4-a716-446655440161',
          workmodeId: 'system:implementation',
        },
        snapshot: {
          agentId: AGENT_ID,
          agentClass: 'Worker',
          correlation: {
            runId: RUN_ID,
            parentId: AGENT_ID,
            sequence: 1,
          },
          budget: {
            maxTurns: 3,
            maxTokens: 100,
            timeoutMs: 1000,
          },
          usage: {
            turnsUsed: 1,
            tokensUsed: 10,
            elapsedMs: 50,
            spawnUnitsUsed: 0,
          },
          startedAt: '2026-03-12T19:00:00.000Z',
          lastUpdatedAt: '2026-03-12T19:00:00.000Z',
          contextFrameCount: 3,
          execution: {
            projectId: PROJECT_ID,
            traceId: TRACE_ID,
            executionId: '550e8400-e29b-41d4-a716-446655440170',
            nodeDefinitionId: '550e8400-e29b-41d4-a716-446655440161',
            workmodeId: 'system:implementation',
          },
        },
      },
    );

    expect(result.output).toEqual({ done: true });
    expect(result.v3Packet.nous.v).toBe(3);
    expect(completeNode).toHaveBeenCalledOnce();
  });

  it('fails task_complete when graph-scoped output validation fails', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        workflowEngine: createWorkflowEngine({
          getRunGraph: vi.fn().mockResolvedValue({
            workflowDefinitionId: '550e8400-e29b-41d4-a716-446655440180',
            projectId: PROJECT_ID,
            version: '1',
            graphDigest: 'b'.repeat(64),
            entryNodeIds: ['550e8400-e29b-41d4-a716-446655440181'],
            topologicalOrder: ['550e8400-e29b-41d4-a716-446655440181'],
            nodes: {
              '550e8400-e29b-41d4-a716-446655440181': {
                definition: {
                  id: '550e8400-e29b-41d4-a716-446655440181',
                  name: 'Complete',
                  type: 'tool-execution',
                  governance: 'must',
                  executionModel: 'sync',
                  config: {
                    type: 'tool-execution',
                    toolName: 'lookup_status',
                    inputMappingRef: 'mapping://status',
                    resultSchemaRef: 'schema://tool-result',
                  },
                },
                inboundEdgeIds: [],
                outboundEdgeIds: [],
                topologicalIndex: 0,
              },
            },
            edges: {},
          }),
        }),
        outputSchemaValidator: {
          validate: vi.fn().mockResolvedValue({
            success: false,
            issues: ['missing done'],
          }),
        },
      },
    });

    await expect(
      bundle.lifecycleHooks.taskComplete!(
        {
          output: {},
        },
        {
          agentId: AGENT_ID,
          agentClass: 'Worker',
          correlation: {
            runId: RUN_ID,
            parentId: AGENT_ID,
            sequence: 1,
          },
          usage: {
            turnsUsed: 1,
            tokensUsed: 10,
            elapsedMs: 50,
            spawnUnitsUsed: 0,
          },
          execution: {
            projectId: PROJECT_ID,
            traceId: TRACE_ID,
            executionId: '550e8400-e29b-41d4-a716-446655440182',
            nodeDefinitionId: '550e8400-e29b-41d4-a716-446655440181',
          },
          snapshot: {
            agentId: AGENT_ID,
            agentClass: 'Worker',
            correlation: {
              runId: RUN_ID,
              parentId: AGENT_ID,
              sequence: 1,
            },
            budget: {
              maxTurns: 3,
              maxTokens: 100,
              timeoutMs: 1000,
            },
            usage: {
              turnsUsed: 1,
              tokensUsed: 10,
              elapsedMs: 50,
              spawnUnitsUsed: 0,
            },
            startedAt: '2026-03-12T19:00:00.000Z',
            lastUpdatedAt: '2026-03-12T19:00:00.000Z',
            contextFrameCount: 1,
            execution: {
              projectId: PROJECT_ID,
              traceId: TRACE_ID,
              executionId: '550e8400-e29b-41d4-a716-446655440182',
              nodeDefinitionId: '550e8400-e29b-41d4-a716-446655440181',
            },
          },
        },
      ),
    ).rejects.toThrow('schema validation');
  });
});
