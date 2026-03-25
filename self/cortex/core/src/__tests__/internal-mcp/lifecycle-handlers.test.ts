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
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
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
    expect(result.v3Packet.payload).toMatchObject({
      schema: 'schema://completion',
      artifact_type: 'model-call',
      data: { done: true },
    });
    expect(result.v3Packet.emitter_agent_class).toBe('Worker');
    expect(completeNode).toHaveBeenCalledOnce();
  });

  it('fails task_complete when graph-scoped output validation fails', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
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

  it('always calls admission guard when dispatchAgent is invoked (no bypass)', async () => {
    const admissionGuard = createWorkmodeAdmissionGuard();
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      deps: {
        workmodeAdmissionGuard: admissionGuard,
        dispatchRuntime: {
          dispatchChild: vi.fn().mockResolvedValue({
            status: 'completed',
            output: { done: true },
            v3Packet: {
              nous: { v: 3 },
              route: {
                emitter: { id: 'internal-mcp::worker::node-test::task-complete' },
                target: { id: 'internal-mcp::parent::run-test::receive-task-complete' },
              },
              envelope: { direction: 'internal', type: 'response_packet' },
              correlation: {
                handoff_id: 'handoff-1',
                correlation_id: RUN_ID,
                cycle: 'n/a',
                emitted_at_utc: '2026-03-12T19:00:00.000Z',
                emitted_at_unix_ms: '1773342000000',
                emitted_at_unix_us: '1773342000000000',
                sequence_in_run: '1',
              },
              payload: { schema: 'n/a', artifact_type: 'n/a', data: { done: true } },
              retry: {
                policy: 'value-proportional',
                depth: 'lightweight',
                importance_tier: 'standard',
                expected_quality_gain: 'n/a',
                estimated_tokens: 'n/a',
                estimated_compute_minutes: 'n/a',
                token_price_ref: 'runtime:gateway',
                compute_price_ref: 'runtime:gateway',
                decision: 'accept',
                decision_log_ref: 'runtime:gateway/task-complete',
                benchmark_tier: 'n/a',
                self_repair: {
                  required_on_fail_close: true,
                  orchestration_state: 'deferred',
                  approval_role: 'Cortex:System',
                  implementation_mode: 'direct',
                  plan_ref: 'runtime:gateway/self-repair',
                },
              },
            },
            correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 1 },
            usage: { turnsUsed: 1, tokensUsed: 20, elapsedMs: 10, spawnUnitsUsed: 0 },
            evidenceRefs: [],
          }),
        },
      },
    });

    await bundle.lifecycleHooks.dispatchAgent!(
      {
        targetClass: 'Worker',
        taskInstructions: 'Do work',
      },
      {
        agentId: AGENT_ID,
        agentClass: 'Orchestrator',
        correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
        usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
        execution: {
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          workmodeId: 'system:implementation',
        },
        snapshot: {
          agentId: AGENT_ID,
          agentClass: 'Orchestrator',
          correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
          budget: { maxTurns: 3, maxTokens: 100, timeoutMs: 1000 },
          usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
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
    );

    expect(admissionGuard.evaluateDispatchAdmission).toHaveBeenCalledOnce();
    expect(admissionGuard.evaluateDispatchAdmission).toHaveBeenCalledWith({
      sourceActor: 'orchestration_agent',
      targetActor: 'worker_agent',
      action: 'dispatch_agent',
      projectRunId: undefined,
      workmodeId: 'system:implementation',
    });
    expect(admissionGuard.evaluateScopeGuard).toHaveBeenCalledOnce();
    expect(admissionGuard.evaluateScopeGuard).toHaveBeenCalledWith({
      sourceActor: 'orchestration_agent',
      targetActor: 'worker_agent',
      action: 'dispatch_agent',
      projectRunId: undefined,
      workmodeId: 'system:implementation',
      executionContext: {
        workmodeId: 'system:implementation',
        agentClass: 'Orchestrator',
        nodeDefinitionId: undefined,
      },
    });
  });

  it('rejects dispatch_agent when scope guard denies (fail-close with witness evidence)', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard({
          evaluateScopeGuard: vi.fn().mockReturnValue({
            allowed: false,
            reasonCode: 'WMODE-SCOPE-GUARD-VIOLATION',
            evidenceRefs: ['scope guard violation: action="dispatch_agent" requires workmodeId in executionContext'],
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
          correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
          usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
          execution: {
            projectId: PROJECT_ID,
            traceId: TRACE_ID,
            workmodeId: 'system:implementation',
          },
          snapshot: {
            agentId: AGENT_ID,
            agentClass: 'Orchestrator',
            correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
            budget: { maxTurns: 3, maxTokens: 100, timeoutMs: 1000 },
            usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
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
    ).rejects.toThrow('WMODE-SCOPE-GUARD-VIOLATION');
  });

  it('calls evaluateScopeGuard with executionContext from lifecycleContext', async () => {
    const scopeGuardMock = vi.fn().mockReturnValue({ allowed: true });
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard({
          evaluateScopeGuard: scopeGuardMock,
        }),
        dispatchRuntime: {
          dispatchChild: vi.fn().mockResolvedValue({
            status: 'completed',
            output: { done: true },
            v3Packet: {
              nous: { v: 3 },
              route: {
                emitter: { id: 'internal-mcp::worker::node-test::task-complete' },
                target: { id: 'internal-mcp::parent::run-test::receive-task-complete' },
              },
              envelope: { direction: 'internal', type: 'response_packet' },
              correlation: {
                handoff_id: 'handoff-1',
                correlation_id: RUN_ID,
                cycle: 'n/a',
                emitted_at_utc: '2026-03-12T19:00:00.000Z',
                emitted_at_unix_ms: '1773342000000',
                emitted_at_unix_us: '1773342000000000',
                sequence_in_run: '1',
              },
              payload: { schema: 'n/a', artifact_type: 'n/a', data: { done: true } },
              retry: {
                policy: 'value-proportional',
                depth: 'lightweight',
                importance_tier: 'standard',
                expected_quality_gain: 'n/a',
                estimated_tokens: 'n/a',
                estimated_compute_minutes: 'n/a',
                token_price_ref: 'runtime:gateway',
                compute_price_ref: 'runtime:gateway',
                decision: 'accept',
                decision_log_ref: 'runtime:gateway/task-complete',
                benchmark_tier: 'n/a',
                self_repair: {
                  required_on_fail_close: true,
                  orchestration_state: 'deferred',
                  approval_role: 'Cortex:System',
                  implementation_mode: 'direct',
                  plan_ref: 'runtime:gateway/self-repair',
                },
              },
            },
            correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 1 },
            usage: { turnsUsed: 1, tokensUsed: 20, elapsedMs: 10, spawnUnitsUsed: 0 },
            evidenceRefs: [],
          }),
        },
      },
    });

    await bundle.lifecycleHooks.dispatchAgent!(
      {
        targetClass: 'Worker',
        taskInstructions: 'Do work',
      },
      {
        agentId: AGENT_ID,
        agentClass: 'Orchestrator',
        correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
        usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
        execution: {
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          workmodeId: 'system:implementation',
        },
        snapshot: {
          agentId: AGENT_ID,
          agentClass: 'Orchestrator',
          correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
          budget: { maxTurns: 3, maxTokens: 100, timeoutMs: 1000 },
          usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
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
    );

    expect(scopeGuardMock).toHaveBeenCalledOnce();
    expect(scopeGuardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dispatch_agent',
        executionContext: {
          workmodeId: 'system:implementation',
          agentClass: 'Orchestrator',
          nodeDefinitionId: undefined,
        },
      }),
    );
  });

  it('populates emitter_agent_class in task completion packets', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        outputSchemaValidator: {
          validate: vi.fn().mockResolvedValue({ success: true }),
        },
      },
    });

    const result = await bundle.lifecycleHooks.taskComplete!(
      {
        output: { status: 'ok' },
        summary: 'task done',
      },
      {
        agentId: AGENT_ID,
        agentClass: 'Orchestrator',
        correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 1 },
        usage: { turnsUsed: 1, tokensUsed: 10, elapsedMs: 50, spawnUnitsUsed: 0 },
        snapshot: {
          agentId: AGENT_ID,
          agentClass: 'Orchestrator',
          correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 1 },
          budget: { maxTurns: 3, maxTokens: 100, timeoutMs: 1000 },
          usage: { turnsUsed: 1, tokensUsed: 10, elapsedMs: 50, spawnUnitsUsed: 0 },
          startedAt: '2026-03-12T19:00:00.000Z',
          lastUpdatedAt: '2026-03-12T19:00:00.000Z',
          contextFrameCount: 1,
        },
      },
    );

    expect(result.v3Packet.emitter_agent_class).toBe('Orchestrator');
  });
});
