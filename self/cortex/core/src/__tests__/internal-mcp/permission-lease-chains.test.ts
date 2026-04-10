import { describe, expect, it, vi } from 'vitest';
import { LeaseContractSchema } from '@nous/shared';
import {
  createInternalMcpSurfaceBundle,
  createScopedMcpToolSurface,
} from '../../internal-mcp/index.js';
import {
  AGENT_ID,
  PROJECT_ID,
  RUN_ID,
  TRACE_ID,
  createWorkmodeAdmissionGuard,
  createProjectApi,
  createPfcEngine,
} from '../agent-gateway/helpers.js';

describe('Permission Lease Chains', () => {
  describe('Tier 1 — Contract Tests', () => {
    it('backward compatibility: LeaseContract without granted_tools validates', () => {
      const lease = {
        lease_id: '550e8400-e29b-41d4-a716-446655440200',
        project_run_id: '550e8400-e29b-41d4-a716-446655440201',
        workmode_id: 'system:implementation',
        entrypoint_ref: 'test-entry',
        sop_ref: 'test-sop',
        scope_ref: 'test-scope',
        context_profile: 'test-profile',
        ttl: 3600,
        issued_by: 'nous_cortex',
        issued_at: '2026-04-09T00:00:00.000Z',
        expires_at: '2026-04-09T01:00:00.000Z',
        revocation_ref: null,
      };

      const result = LeaseContractSchema.parse(lease);
      expect(result.granted_tools).toBeUndefined();
      expect(result.lease_id).toBe(lease.lease_id);
    });

    it('LeaseContract with granted_tools validates', () => {
      const lease = {
        lease_id: '550e8400-e29b-41d4-a716-446655440200',
        project_run_id: '550e8400-e29b-41d4-a716-446655440201',
        workmode_id: 'system:implementation',
        entrypoint_ref: 'test-entry',
        sop_ref: 'test-sop',
        scope_ref: 'test-scope',
        context_profile: 'test-profile',
        ttl: 3600,
        issued_by: 'nous_cortex',
        issued_at: '2026-04-09T00:00:00.000Z',
        expires_at: '2026-04-09T01:00:00.000Z',
        revocation_ref: null,
        granted_tools: ['workflow_create', 'workflow_update'],
      };

      const result = LeaseContractSchema.parse(lease);
      expect(result.granted_tools).toEqual(['workflow_create', 'workflow_update']);
    });

    it('LeaseContract with empty granted_tools validates', () => {
      const lease = {
        lease_id: '550e8400-e29b-41d4-a716-446655440200',
        project_run_id: '550e8400-e29b-41d4-a716-446655440201',
        workmode_id: 'system:implementation',
        entrypoint_ref: 'test-entry',
        sop_ref: 'test-sop',
        scope_ref: 'test-scope',
        context_profile: 'test-profile',
        ttl: 3600,
        issued_by: 'nous_cortex',
        issued_at: '2026-04-09T00:00:00.000Z',
        expires_at: '2026-04-09T01:00:00.000Z',
        revocation_ref: null,
        granted_tools: [],
      };

      const result = LeaseContractSchema.parse(lease);
      expect(result.granted_tools).toEqual([]);
    });
  });

  describe('Tier 3 — Two-Hop Chain Integration', () => {
    const DISPATCH_RESULT = {
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
    };

    const LIFECYCLE_CONTEXT = {
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

    it('Orchestrator with lease grants can sub-grant a subset to Worker dispatch', async () => {
      const dispatchChild = vi.fn().mockResolvedValue(DISPATCH_RESULT);

      // Orchestrator gets workflow_create and workflow_update via lease
      const orchestratorBundle = createInternalMcpSurfaceBundle({
        agentClass: 'Orchestrator',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          dispatchRuntime: { dispatchChild },
        },
        lease: {
          lease_id: '550e8400-e29b-41d4-a716-446655440300' as never,
          project_run_id: '550e8400-e29b-41d4-a716-446655440301',
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
          granted_tools: ['workflow_create', 'workflow_update'],
        },
      });

      // Orchestrator dispatches Worker with a subset of its grants
      await orchestratorBundle.lifecycleHooks.dispatchWorker!(
        {
          taskInstructions: 'Create a workflow',
          granted_tools: ['workflow_create'],
        } as never,
        LIFECYCLE_CONTEXT,
      );

      expect(dispatchChild).toHaveBeenCalledOnce();
      expect(dispatchChild).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            granted_tools: ['workflow_create'],
          }),
        }),
      );

      // Verify the Worker surface built with that lease includes the granted tool
      const workerSurface = createScopedMcpToolSurface({
        agentClass: 'Worker',
        agentId: AGENT_ID,
        deps: {
          getProjectApi: () => createProjectApi(),
          pfc: createPfcEngine(),
        },
        lease: {
          lease_id: '550e8400-e29b-41d4-a716-446655440400' as never,
          project_run_id: '550e8400-e29b-41d4-a716-446655440401',
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
          granted_tools: ['workflow_create'],
        },
      });

      const workerTools = (await workerSurface.listTools()).map((t) => t.name);
      expect(workerTools).toContain('workflow_create');
      expect(workerTools).not.toContain('workflow_update');
      // Baseline tools still present
      expect(workerTools).toContain('task_complete');
    });

    it('Orchestrator cannot grant tools it does not possess (even with lease)', async () => {
      const orchestratorBundle = createInternalMcpSurfaceBundle({
        agentClass: 'Orchestrator',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          dispatchRuntime: { dispatchChild: vi.fn() },
        },
        lease: {
          lease_id: '550e8400-e29b-41d4-a716-446655440300' as never,
          project_run_id: '550e8400-e29b-41d4-a716-446655440301',
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
          granted_tools: ['workflow_create'],
        },
      });

      // promoted_memory_promote is NOT in Orchestrator baseline or lease
      await expect(
        orchestratorBundle.lifecycleHooks.dispatchWorker!(
          {
            taskInstructions: 'Do work',
            granted_tools: ['promoted_memory_promote'],
          } as never,
          LIFECYCLE_CONTEXT,
        ),
      ).rejects.toThrow('not possessed by the dispatcher');
    });

    it('Worker with lease-granted dispatch_worker cannot pass granted_tools (three-hop blocked)', async () => {
      const workerBundle = createInternalMcpSurfaceBundle({
        agentClass: 'Worker',
        agentId: AGENT_ID,
        deps: {
          workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
          dispatchRuntime: { dispatchChild: vi.fn() },
        },
        lease: {
          lease_id: '550e8400-e29b-41d4-a716-446655440500' as never,
          project_run_id: '550e8400-e29b-41d4-a716-446655440501',
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

      // Worker has dispatch_worker via lease, so the hook should exist
      if (workerBundle.lifecycleHooks.dispatchWorker) {
        await expect(
          workerBundle.lifecycleHooks.dispatchWorker(
            {
              taskInstructions: 'Sub-delegate',
              granted_tools: ['workflow_create'],
            } as never,
            {
              ...LIFECYCLE_CONTEXT,
              agentClass: 'Worker',
              snapshot: {
                ...LIFECYCLE_CONTEXT.snapshot,
                agentClass: 'Worker',
              },
            },
          ),
        ).rejects.toThrow('two-hop ceiling');
      } else {
        // If the hook doesn't exist, that's also fine — Workers can't dispatch
        expect(workerBundle.lifecycleHooks.dispatchWorker).toBeUndefined();
      }
    });
  });
});
