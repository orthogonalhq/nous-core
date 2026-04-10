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
  it('rejects dispatch_worker when workmode admission denies the dispatch', async () => {
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
      bundle.lifecycleHooks.dispatchWorker!(
        {
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

  it('always calls admission guard when dispatchWorker is invoked (no bypass)', async () => {
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

    await bundle.lifecycleHooks.dispatchWorker!(
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
      action: 'dispatch_worker',
      projectRunId: undefined,
      workmodeId: 'system:implementation',
    });
    expect(admissionGuard.evaluateScopeGuard).toHaveBeenCalledOnce();
    expect(admissionGuard.evaluateScopeGuard).toHaveBeenCalledWith({
      sourceActor: 'orchestration_agent',
      targetActor: 'worker_agent',
      action: 'dispatch_worker',
      projectRunId: undefined,
      workmodeId: 'system:implementation',
      executionContext: {
        workmodeId: 'system:implementation',
        agentClass: 'Orchestrator',
        nodeDefinitionId: undefined,
      },
    });
  });

  it('rejects dispatch_worker when scope guard denies (fail-close with witness evidence)', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard({
          evaluateScopeGuard: vi.fn().mockReturnValue({
            allowed: false,
            reasonCode: 'WMODE-SCOPE-GUARD-VIOLATION',
            evidenceRefs: ['scope guard violation: action="dispatch_worker" requires workmodeId in executionContext'],
          }),
        }),
        dispatchRuntime: {
          dispatchChild: vi.fn(),
        },
      },
    });

    await expect(
      bundle.lifecycleHooks.dispatchWorker!(
        {
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

    await bundle.lifecycleHooks.dispatchWorker!(
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
        action: 'dispatch_worker',
        executionContext: {
          workmodeId: 'system:implementation',
          agentClass: 'Orchestrator',
          nodeDefinitionId: undefined,
        },
      }),
    );
  });

  describe('permission lease chain validation', () => {
    const DISPATCH_LIFECYCLE_CONTEXT = {
      agentId: AGENT_ID,
      agentClass: 'Orchestrator' as const,
      correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
      usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
      execution: {
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        workmodeId: 'system:implementation',
      },
      snapshot: {
        agentId: AGENT_ID,
        agentClass: 'Orchestrator' as const,
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
    };

    it('rejects granted_tools containing tools not possessed by the dispatcher (subset constraint)', async () => {
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Orchestrator',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          dispatchRuntime: {
            dispatchChild: vi.fn(),
          },
        },
      });

      await expect(
        bundle.lifecycleHooks.dispatchWorker!(
          {
            taskInstructions: 'Do work',
            granted_tools: ['promoted_memory_promote'],
          } as never,
          DISPATCH_LIFECYCLE_CONTEXT,
        ),
      ).rejects.toThrow('not possessed by the dispatcher');
    });

    it('rejects granted_tools containing invalid tool names', async () => {
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Orchestrator',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          dispatchRuntime: {
            dispatchChild: vi.fn(),
          },
        },
      });

      await expect(
        bundle.lifecycleHooks.dispatchWorker!(
          {
            taskInstructions: 'Do work',
            granted_tools: ['nonexistent_tool'],
          } as never,
          DISPATCH_LIFECYCLE_CONTEXT,
        ),
      ).rejects.toThrow('invalid tool names');
    });

    it('rejects granted_tools when dispatcher is a Worker (two-hop ceiling)', async () => {
      // Workers lack dispatch_worker in baseline, so we give it via lease grants
      // to test the two-hop ceiling defense-in-depth
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Worker',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          dispatchRuntime: {
            dispatchChild: vi.fn(),
          },
        },
        lease: {
          lease_id: '550e8400-e29b-41d4-a716-446655440200' as never,
          project_run_id: '550e8400-e29b-41d4-a716-446655440201',
          workmode_id: 'system:implementation' as never,
          entrypoint_ref: 'test',
          sop_ref: 'test',
          scope_ref: 'test',
          context_profile: 'test',
          ttl: 3600,
          issued_by: 'nous_cortex',
          issued_at: '2026-04-09T00:00:00.000Z',
          expires_at: '2026-04-09T01:00:00.000Z',
          revocation_ref: null,
          granted_tools: ['dispatch_worker', 'workflow_create'],
        },
      });

      // Worker has dispatch_worker via lease, but should not be able to delegate
      // Note: dispatchWorker hook is only created if toolSet.has('dispatch_worker')
      // With lease grants, the Worker now has dispatch_worker in its effective set
      if (bundle.lifecycleHooks.dispatchWorker) {
        await expect(
          bundle.lifecycleHooks.dispatchWorker(
            {
              taskInstructions: 'Do work',
              granted_tools: ['workflow_create'],
            } as never,
            {
              ...DISPATCH_LIFECYCLE_CONTEXT,
              agentClass: 'Worker',
              snapshot: {
                ...DISPATCH_LIFECYCLE_CONTEXT.snapshot,
                agentClass: 'Worker',
              },
            },
          ),
        ).rejects.toThrow('two-hop ceiling');
      }
    });

    it('allows dispatch with valid granted_tools that are a subset of dispatcher effective grants', async () => {
      const dispatchChild = vi.fn().mockResolvedValue({
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
      });

      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Orchestrator',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          dispatchRuntime: { dispatchChild },
        },
      });

      // workflow_list is in the Orchestrator baseline, so granting it should succeed
      await bundle.lifecycleHooks.dispatchWorker!(
        {
          taskInstructions: 'Do work',
          granted_tools: ['workflow_list'],
        } as never,
        DISPATCH_LIFECYCLE_CONTEXT,
      );

      expect(dispatchChild).toHaveBeenCalledOnce();
      expect(dispatchChild).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            granted_tools: ['workflow_list'],
          }),
        }),
      );
    });
  });

  describe('requestEscalation bridge', () => {
    const LIFECYCLE_CONTEXT_BASE = {
      agentId: AGENT_ID,
      agentClass: 'Cortex::System' as const,
      correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
      usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
      snapshot: {
        agentId: AGENT_ID,
        agentClass: 'Cortex::System' as const,
        correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
        budget: { maxTurns: 3, maxTokens: 100, timeoutMs: 1000 },
        usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
        startedAt: '2026-03-12T19:00:00.000Z',
        lastUpdatedAt: '2026-03-12T19:00:00.000Z',
        contextFrameCount: 0,
      },
    };

    it('calls escalationService.notify() with correct EscalationContract fields', async () => {
      const notify = vi.fn().mockResolvedValue('esc-001');
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Cortex::System',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          escalationService: { notify, checkResponse: vi.fn(), getInAppRecord: vi.fn(), listInAppRecords: vi.fn(), acknowledgeInApp: vi.fn() },
          now: () => '2026-03-25T10:00:00.000Z',
        },
      });

      await bundle.lifecycleHooks.requestEscalation!(
        { reason: 'Test escalation', severity: 'critical', detail: {} },
        {
          ...LIFECYCLE_CONTEXT_BASE,
          execution: { projectId: PROJECT_ID, traceId: TRACE_ID, workmodeId: 'system:implementation' },
        },
      );

      expect(notify).toHaveBeenCalledOnce();
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'Test escalation',
          triggerReason: 'Test escalation',
          requiredAction: 'Test escalation',
          channel: 'in-app',
          projectId: PROJECT_ID,
          priority: 'critical',
          timestamp: '2026-03-25T10:00:00.000Z',
        }),
      );
    });

    it('circuit-breaker: does NOT call notify() when escalationOrigin is true', async () => {
      const notify = vi.fn().mockResolvedValue('esc-002');
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Cortex::System',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          escalationService: { notify, checkResponse: vi.fn(), getInAppRecord: vi.fn(), listInAppRecords: vi.fn(), acknowledgeInApp: vi.fn() },
        },
      });

      await bundle.lifecycleHooks.requestEscalation!(
        { reason: 'Recursive escalation', severity: 'high', detail: {} },
        {
          ...LIFECYCLE_CONTEXT_BASE,
          execution: {
            projectId: PROJECT_ID,
            traceId: TRACE_ID,
            workmodeId: 'system:implementation',
            escalationOrigin: true,
          },
        },
      );

      expect(notify).not.toHaveBeenCalled();
    });

    it('calls addHealthIssue when escalationService is undefined', async () => {
      const addHealthIssue = vi.fn();
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Cortex::System',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          addHealthIssue,
        },
      });

      await bundle.lifecycleHooks.requestEscalation!(
        { reason: 'No service', severity: 'low', detail: {} },
        {
          ...LIFECYCLE_CONTEXT_BASE,
          execution: { projectId: PROJECT_ID, traceId: TRACE_ID },
        },
      );

      expect(addHealthIssue).toHaveBeenCalledWith('escalation_service_unavailable');
    });

    it('calls addHealthIssue when projectId is undefined', async () => {
      const addHealthIssue = vi.fn();
      const notify = vi.fn();
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Cortex::System',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          escalationService: { notify, checkResponse: vi.fn(), getInAppRecord: vi.fn(), listInAppRecords: vi.fn(), acknowledgeInApp: vi.fn() },
          addHealthIssue,
        },
      });

      await bundle.lifecycleHooks.requestEscalation!(
        { reason: 'No project', severity: 'medium', detail: {} },
        {
          ...LIFECYCLE_CONTEXT_BASE,
          execution: { traceId: TRACE_ID },
        },
      );

      expect(notify).not.toHaveBeenCalled();
      expect(addHealthIssue).toHaveBeenCalledWith('escalation_bridge_no_project');
    });
  });

  describe('flagObservation bridge', () => {
    const LIFECYCLE_CONTEXT_BASE = {
      agentId: AGENT_ID,
      agentClass: 'Cortex::System' as const,
      correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
      usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
      snapshot: {
        agentId: AGENT_ID,
        agentClass: 'Cortex::System' as const,
        correlation: { runId: RUN_ID, parentId: AGENT_ID, sequence: 0 },
        budget: { maxTurns: 3, maxTokens: 100, timeoutMs: 1000 },
        usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
        startedAt: '2026-03-12T19:00:00.000Z',
        lastUpdatedAt: '2026-03-12T19:00:00.000Z',
        contextFrameCount: 0,
      },
    };

    it('calls addHealthIssue with observation type', async () => {
      const addHealthIssue = vi.fn();
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Cortex::System',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          addHealthIssue,
        },
      });

      await bundle.lifecycleHooks.flagObservation!(
        { observationType: 'anomaly', content: 'Something happened', detail: {} },
        {
          ...LIFECYCLE_CONTEXT_BASE,
          execution: { projectId: PROJECT_ID, traceId: TRACE_ID },
        },
      );

      expect(addHealthIssue).toHaveBeenCalledWith('observation_anomaly');
    });

    it('completes without error when addHealthIssue is undefined', async () => {
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Cortex::System',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        },
      });

      // Should not throw
      await bundle.lifecycleHooks.flagObservation!(
        { observationType: 'anomaly', content: 'Something happened', detail: {} },
        {
          ...LIFECYCLE_CONTEXT_BASE,
          execution: { projectId: PROJECT_ID, traceId: TRACE_ID },
        },
      );
    });
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
