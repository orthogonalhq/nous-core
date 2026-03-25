import { describe, expect, it, vi } from 'vitest';
import { createInternalMcpSurfaceBundle } from '../../internal-mcp/index.js';
import { WorkmodeAdmissionGuard } from '../../workmode/admission-guard.js';
import {
  createBaseInput,
  createGatewayHarness,
  createProjectApi,
  createStampedPacket,
  createWorkflowEngine,
  createWorkmodeAdmissionGuard,
} from './helpers.js';

describe('AgentGateway dispatch chain integration', () => {
  it('completes the full dispatch chain: System -> Orchestrator -> Worker -> task_complete -> v3 packet -> completeNode', async () => {
    const completeNodeSpy = vi.fn().mockResolvedValue({});
    const workflowEngine = createWorkflowEngine({
      completeNode: completeNodeSpy,
      getRunGraph: vi.fn().mockResolvedValue(null),
    });

    // Worker bundle — the innermost agent. Calls task_complete.
    const workerBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440200' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
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
          response: 'task done',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { result: 'worker-output' },
                summary: 'Worker completed its task',
              },
            },
          ],
        }),
      ],
    });

    // Orchestrator bundle — dispatches the Worker, then calls task_complete.
    const orchestratorBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: '550e8400-e29b-41d4-a716-446655440201' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            // Run the worker gateway inline as the dispatch runtime would
            const workerResult = await workerGateway.run(
              createBaseInput({
                taskInstructions: request.taskInstructions,
              }),
            );
            return {
              ...workerResult,
              evidenceRefs: workerResult.evidenceRefs ?? [],
            };
          },
        },
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway: orchestratorGateway } = createGatewayHarness({
      agentClass: 'Orchestrator',
      toolSurface: orchestratorBundle.toolSurface,
      lifecycleHooks: orchestratorBundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'dispatch worker',
          toolCalls: [
            {
              name: 'dispatch_agent',
              params: {
                target_class: 'Worker',
                task_instructions: 'Execute the sub-task',
              },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { orchestrated: true },
                summary: 'Orchestrator completed',
              },
            },
          ],
        }),
      ],
    });

    // System dispatches the Orchestrator
    const systemBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Cortex::System',
      agentId: '550e8400-e29b-41d4-a716-446655440202' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const orchResult = await orchestratorGateway.run(
              createBaseInput({
                taskInstructions: request.taskInstructions,
              }),
            );
            return {
              ...orchResult,
              evidenceRefs: orchResult.evidenceRefs ?? [],
            };
          },
        },
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway: systemGateway } = createGatewayHarness({
      agentClass: 'Cortex::System',
      toolSurface: systemBundle.toolSurface,
      lifecycleHooks: systemBundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'dispatch orchestrator',
          toolCalls: [
            {
              name: 'dispatch_agent',
              params: {
                target_class: 'Orchestrator',
                task_instructions: 'Orchestrate the workflow',
              },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { systemDone: true },
                summary: 'System completed',
              },
            },
          ],
        }),
      ],
    });

    const result = await systemGateway.run(createBaseInput());

    // Assert full chain completed
    expect(result.status).toBe('completed');

    // Assert v3 packet is stamped
    expect(result.v3Packet).toBeDefined();
    expect(result.v3Packet!.nous.v).toBe(3);
    expect(result.v3Packet!.route.emitter.id).toContain('task-complete');
    expect(result.v3Packet!.route.target.id).toContain('receive-task-complete');
    expect(result.v3Packet!.envelope.direction).toBe('internal');
    expect(result.v3Packet!.envelope.type).toBe('response_packet');
    expect(result.v3Packet!.correlation.correlation_id).toBeDefined();
    expect(result.v3Packet!.emitter_agent_class).toBe('Cortex::System');
  });

  it('request_escalation blocks the calling agent and produces an escalated result', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440210' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'need help',
          toolCalls: [
            {
              name: 'request_escalation',
              params: {
                severity: 'high',
                reason: 'Cannot resolve ambiguity',
                detail: { context: 'phase-1.1' },
              },
            },
          ],
        }),
      ],
    });

    const result = await gateway.run(createBaseInput());

    // request_escalation is terminal — it blocks the agent
    expect(result.status).toBe('escalated');
    expect(result.reason).toBe('Cannot resolve ambiguity');
    expect(result.severity).toBe('high');
  });

  it('flag_observation is fire-and-forget and does not block the turn loop', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440220' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway, outbox } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'observed something',
          toolCalls: [
            {
              name: 'flag_observation',
              params: {
                observation_type: 'quality_signal',
                content: 'Code pattern looks good',
              },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { done: true },
                summary: 'Completed after observation',
              },
            },
          ],
        }),
      ],
    });

    const result = await gateway.run(createBaseInput());

    // flag_observation does NOT terminate the agent — it continues to task_complete
    expect(result.status).toBe('completed');
    // Observation was emitted to outbox
    expect(outbox.events.some((event) => event.type === 'observation')).toBe(true);
  });

  it('abort message delivered via inbox terminates the agent with aborted result', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440230' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway, modelProvider } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      outputs: ['should not run'],
    });

    // Deliver abort before run
    await gateway.getInboxHandle().abort('Operator shutdown');
    const result = await gateway.run(createBaseInput());

    expect(result.status).toBe('aborted');
    expect(result.reason).toBe('Operator shutdown');
    expect(modelProvider.invoke).not.toHaveBeenCalled();
  });

  it('context injection via inbox appears in subsequent turn LLM input', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440240' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway, modelProvider } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'working',
          toolCalls: [],
        }),
        JSON.stringify({
          response: 'done',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { done: true },
                summary: 'Completed with injected context',
              },
            },
          ],
        }),
      ],
    });

    // Inject context before run
    await gateway.getInboxHandle().injectContext([
      {
        role: 'system',
        source: 'inbox',
        content: 'Priority update: focus on security',
        createdAt: '2026-03-12T19:00:00.000Z',
      },
    ]);

    const result = await gateway.run(createBaseInput());
    expect(result.status).toBe('completed');

    // Verify injected context appeared in the first model invocation's context
    const firstInvoke = modelProvider.invoke.mock.calls[0][0];
    const contextFrames = firstInvoke.input.context as Array<{
      source: string;
      content: string;
    }>;
    const injectedFrame = contextFrames.find(
      (frame) => frame.source === 'inbox' && frame.content.includes('Priority update'),
    );
    expect(injectedFrame).toBeDefined();
  });

  it('turn-cycle ack events are emitted to the outbox for each turn', async () => {
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440250' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        outputSchemaValidator: {
          validate: async () => ({ success: true }),
        },
      },
    });

    const { gateway, outbox } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'working',
          toolCalls: [],
        }),
        JSON.stringify({
          response: 'done',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { done: true },
              },
            },
          ],
        }),
      ],
    });

    const result = await gateway.run(createBaseInput());
    expect(result.status).toBe('completed');

    // Each turn should emit a turn_ack event
    const turnAcks = outbox.events.filter((event) => event.type === 'turn_ack');
    expect(turnAcks.length).toBeGreaterThanOrEqual(2);
    expect(turnAcks[0]).toHaveProperty('turn');
    expect(turnAcks[0]).toHaveProperty('correlation');
    expect(turnAcks[0]).toHaveProperty('emittedAt');
  });
});
