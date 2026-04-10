import { NousError } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { createInternalMcpSurfaceBundle } from '../../internal-mcp/index.js';
import { WorkmodeAdmissionGuard } from '../../workmode/admission-guard.js';
import {
  createBaseInput,
  createGatewayHarness,
  createProjectApi,
  createStampedPacket,
  createWorkmodeAdmissionGuard,
} from './helpers.js';

describe('AgentGateway lifecycle integration', () => {
  it('executes multiple dispatch_worker calls concurrently and preserves result order', async () => {
    const started: string[] = [];
    let resolveStarted!: () => void;
    let releaseChildren!: () => void;
    const allStarted = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const waitForRelease = new Promise<void>((resolve) => {
      releaseChildren = resolve;
    });

    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: createBaseInput().correlation.parentId!,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            started.push(request.taskInstructions);
            if (started.length === 2) {
              resolveStarted();
            }
            await waitForRelease;
            return {
              status: 'completed',
              output: { child: request.taskInstructions },
              v3Packet: createStampedPacket(),
              correlation: createBaseInput().correlation,
              usage: {
                turnsUsed: 1,
                tokensUsed: 20,
                elapsedMs: 10,
                spawnUnitsUsed: 0,
              },
              evidenceRefs: [],
            };
          },
        },
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway, modelProvider } = createGatewayHarness({
      agentClass: 'Orchestrator',
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'dispatch both workers',
          toolCalls: [
            {
              name: 'dispatch_worker',
              params: {
                task_instructions: 'child-one',
              },
            },
            {
              name: 'dispatch_worker',
              params: {
                task_instructions: 'child-two',
              },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [{ name: 'task_complete', params: { output: { done: true } } }],
        }),
      ],
    });

    const runPromise = gateway.run(createBaseInput());
    await allStarted;
    expect(started).toEqual(['child-one', 'child-two']);
    releaseChildren();
    const result = await runPromise;

    expect(result.status).toBe('completed');
    const secondInvoke = modelProvider.invoke.mock.calls[1][0];
    // Text adapter produces { prompt, context } format with GatewayContextFrame[]
    const context = secondInvoke.input.context as Array<{ role: string; content: string }>;
    // After adapter.formatRequest, child_result frames become context entries; filter by content
    const childFrames = context.filter(
      (frame) => frame.content.includes('child-one') || frame.content.includes('child-two'),
    );

    expect(childFrames).toHaveLength(2);
    expect(childFrames[0]?.content).toContain('child-one');
    expect(childFrames[1]?.content).toContain('child-two');
  });

  it('keeps flag_observation non-terminal while emitting the outbox event', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: createBaseInput().correlation.parentId!,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway, outbox } = createGatewayHarness({
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'observe',
          toolCalls: [
            {
              name: 'flag_observation',
              params: {
                observation_type: 'progress_update',
                content: 'halfway there',
              },
            },
          ],
        }),
        JSON.stringify({
          response: 'done',
          toolCalls: [{ name: 'task_complete', params: { output: { done: true } } }],
        }),
      ],
    });

    const result = await gateway.run(createBaseInput());

    expect(result.status).toBe('completed');
    expect(outbox.events.some((event) => event.type === 'observation')).toBe(true);
  });

  describe('dispatch authority enforcement', () => {
    it('Worker dispatch blocked at tool-surface level — no dispatch hooks', () => {
      const bundle = createInternalMcpSurfaceBundle({
        agentClass: 'Worker',
        agentId: createBaseInput().correlation.parentId!,
        deps: {
          workmodeAdmissionGuard: new WorkmodeAdmissionGuard(),
          getProjectApi: () => createProjectApi(),
          outputSchemaValidator: {
            validate: async () => ({ success: true }),
          },
        },
      });

      // Worker agent class does not include dispatch tools in its tool set,
      // so the lifecycle hooks are undefined (Layer 1: structural enforcement).
      expect(bundle.lifecycleHooks.dispatchOrchestrator).toBeUndefined();
      expect(bundle.lifecycleHooks.dispatchWorker).toBeUndefined();
    });

    it('Worker dispatch blocked at admission-guard level (Layer 2)', () => {
      const guard = new WorkmodeAdmissionGuard();

      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'worker_agent',
        targetActor: 'worker_agent',
        action: 'dispatch_worker',
      });

      expect(result.allowed).toBe(false);
      expect(result).toHaveProperty('reasonCode', 'WMODE-010');
    });

    it('Orchestrator-to-Orchestrator nesting blocked by admission guard', () => {
      const guard = new WorkmodeAdmissionGuard();

      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'orchestration_agent',
        targetActor: 'orchestration_agent',
        action: 'dispatch_worker',
      });

      expect(result.allowed).toBe(false);
      expect(result).toHaveProperty('reasonCode', 'WMODE-003');
    });

    it('authority widening blocked by admission guard', () => {
      const guard = new WorkmodeAdmissionGuard();

      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'orchestration_agent',
        targetActor: 'nous_cortex',
        action: 'dispatch_worker',
      });

      expect(result.allowed).toBe(false);
      expect(result).toHaveProperty('reasonCode', 'WMODE-002');
    });

    it('scope guard fail-close produces denial with evidence refs', () => {
      const guard = new WorkmodeAdmissionGuard();

      // Scope-requiring action without execution context triggers fail-close.
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'execute_subphase',
        // No executionContext — triggers fail-close
      });

      expect(result.allowed).toBe(false);
      expect(result).toHaveProperty('reasonCode', 'WMODE-SCOPE-GUARD-VIOLATION');
      expect(result).toHaveProperty('evidenceRefs');
      expect((result as { evidenceRefs: string[] }).evidenceRefs.length).toBeGreaterThan(0);
    });

    it('emitter_agent_class provenance field present in task completion packets', async () => {
      // Worker bundle
      const workerBundle = createInternalMcpSurfaceBundle({
        agentClass: 'Worker',
        agentId: createBaseInput().correlation.parentId!,
        deps: {
          workmodeAdmissionGuard: new WorkmodeAdmissionGuard(),
          getProjectApi: () => createProjectApi(),
          outputSchemaValidator: {
            validate: async () => ({ success: true }),
          },
        },
      });

      const { gateway: workerGateway } = createGatewayHarness({
        agentClass: 'Worker',
        toolSurface: workerBundle.toolSurface,
        lifecycleHooks: workerBundle.lifecycleHooks,
        outputs: [
          JSON.stringify({
            response: 'done',
            toolCalls: [
              {
                name: 'task_complete',
                params: { output: { done: true }, summary: 'completed' },
              },
            ],
          }),
        ],
      });

      const workerResult = await workerGateway.run(createBaseInput());
      expect(workerResult.status).toBe('completed');
      expect(workerResult.v3Packet).toBeDefined();
      expect(workerResult.v3Packet?.emitter_agent_class).toBe('Worker');

      // Orchestrator bundle
      const orchBundle = createInternalMcpSurfaceBundle({
        agentClass: 'Orchestrator',
        agentId: createBaseInput().correlation.parentId!,
        deps: {
          workmodeAdmissionGuard: new WorkmodeAdmissionGuard(),
          getProjectApi: () => createProjectApi(),
          outputSchemaValidator: {
            validate: async () => ({ success: true }),
          },
        },
      });

      const { gateway: orchGateway } = createGatewayHarness({
        agentClass: 'Orchestrator',
        toolSurface: orchBundle.toolSurface,
        lifecycleHooks: orchBundle.lifecycleHooks,
        outputs: [
          JSON.stringify({
            response: 'done',
            toolCalls: [
              {
                name: 'task_complete',
                params: { output: { done: true }, summary: 'completed' },
              },
            ],
          }),
        ],
      });

      const orchResult = await orchGateway.run(createBaseInput());
      expect(orchResult.status).toBe('completed');
      expect(orchResult.v3Packet).toBeDefined();
      expect(orchResult.v3Packet?.emitter_agent_class).toBe('Orchestrator');
    });

    it('all valid dispatch edges succeed through admission guard', async () => {
      const guard = new WorkmodeAdmissionGuard();

      // Cortex::System -> Orchestrator
      const cortexToOrch = guard.evaluateDispatchAdmission({
        sourceActor: 'nous_cortex',
        targetActor: 'orchestration_agent',
        action: 'dispatch_worker',
      });
      expect(cortexToOrch.allowed).toBe(true);

      // Cortex::System -> Worker
      const cortexToWorker = guard.evaluateDispatchAdmission({
        sourceActor: 'nous_cortex',
        targetActor: 'worker_agent',
        action: 'dispatch_worker',
      });
      expect(cortexToWorker.allowed).toBe(true);

      // Orchestrator -> Worker (through full lifecycle handler chain)
      const orchBundle = createInternalMcpSurfaceBundle({
        agentClass: 'Orchestrator',
        agentId: createBaseInput().correlation.parentId!,
        deps: {
          workmodeAdmissionGuard: guard,
          getProjectApi: () => createProjectApi(),
          dispatchRuntime: {
            dispatchChild: async ({ request }) => ({
              status: 'completed' as const,
              output: { dispatched: request.taskInstructions },
              v3Packet: createStampedPacket(),
              correlation: createBaseInput().correlation,
              usage: {
                turnsUsed: 1,
                tokensUsed: 20,
                elapsedMs: 10,
                spawnUnitsUsed: 0,
              },
              evidenceRefs: [],
            }),
          },
          outputSchemaValidator: {
            validate: async () => ({ success: true }),
          },
        },
      });

      const { gateway } = createGatewayHarness({
        agentClass: 'Orchestrator',
        toolSurface: orchBundle.toolSurface,
        lifecycleHooks: orchBundle.lifecycleHooks,
        outputs: [
          JSON.stringify({
            response: 'dispatch worker',
            toolCalls: [
              {
                name: 'dispatch_worker',
                params: {
                  task_instructions: 'valid-dispatch',
                },
              },
            ],
          }),
          JSON.stringify({
            response: 'complete',
            toolCalls: [{ name: 'task_complete', params: { output: { done: true } } }],
          }),
        ],
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
    });

    it('Orchestrator dispatching Orchestrator denied through lifecycle handler', async () => {
      const guard = new WorkmodeAdmissionGuard();

      const orchBundle = createInternalMcpSurfaceBundle({
        agentClass: 'Orchestrator',
        agentId: createBaseInput().correlation.parentId!,
        deps: {
          workmodeAdmissionGuard: guard,
          getProjectApi: () => createProjectApi(),
          dispatchRuntime: {
            dispatchChild: async () => {
              throw new Error('should not reach dispatch runtime');
            },
          },
          outputSchemaValidator: {
            validate: async () => ({ success: true }),
          },
        },
      });

      // The dispatch_orchestrator lifecycle hook should throw before reaching dispatchRuntime.
      expect(orchBundle.lifecycleHooks.dispatchOrchestrator).toBeDefined();

      try {
        await orchBundle.lifecycleHooks.dispatchOrchestrator!(
          {
            dispatchIntent: { type: 'task' },
            taskInstructions: 'nested-orchestrator',
          },
          {
            agentId: createBaseInput().correlation.parentId!,
            correlation: createBaseInput().correlation,
            execution: createBaseInput().execution,
            turn: 1,
          },
        );
        // Should not reach here
        expect.unreachable('Expected DISPATCH_ADMISSION_DENIED error');
      } catch (error) {
        expect(error).toBeInstanceOf(NousError);
        const nousError = error as NousError;
        expect(nousError.code).toBe('DISPATCH_ADMISSION_DENIED');
        expect(nousError.context).toHaveProperty('evidenceRefs');
        expect(Array.isArray(nousError.context?.evidenceRefs)).toBe(true);
      }
    });

    it('denied dispatch produces witness-compatible evidence (START-005)', () => {
      const guard = new WorkmodeAdmissionGuard();

      // Worker -> Worker denied
      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'worker_agent',
        targetActor: 'worker_agent',
        action: 'dispatch_worker',
      });

      expect(result.allowed).toBe(false);
      expect(result).toHaveProperty('evidenceRefs');
      const refs = (result as { evidenceRefs: string[] }).evidenceRefs;
      expect(refs.length).toBeGreaterThan(0);
      // Evidence ref contains context for witness audit trail
      expect(refs[0]).toContain('worker');

      // Worker -> Orchestrator denied
      const result2 = guard.evaluateDispatchAdmission({
        sourceActor: 'worker_agent',
        targetActor: 'orchestration_agent',
        action: 'dispatch_worker',
      });

      expect(result2.allowed).toBe(false);
      expect(result2).toHaveProperty('evidenceRefs');
      expect((result2 as { evidenceRefs: string[] }).evidenceRefs.length).toBeGreaterThan(0);

      // Orchestrator -> Cortex authority widening denied
      const result3 = guard.evaluateDispatchAdmission({
        sourceActor: 'orchestration_agent',
        targetActor: 'nous_cortex',
        action: 'dispatch_worker',
      });

      expect(result3.allowed).toBe(false);
      expect(result3).toHaveProperty('evidenceRefs');
      expect((result3 as { evidenceRefs: string[] }).evidenceRefs.length).toBeGreaterThan(0);
    });
  });
});
