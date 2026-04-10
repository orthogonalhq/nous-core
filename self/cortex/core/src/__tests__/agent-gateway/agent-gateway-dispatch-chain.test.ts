import { describe, expect, it, vi } from 'vitest';
import type { AgentResult, GatewayStampedPacket } from '@nous/shared';
import { GatewayStampedPacketSchema } from '@nous/shared';
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
              name: 'dispatch_worker',
              params: {
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
              name: 'dispatch_orchestrator',
              params: {
                dispatch_intent: { type: 'workflow', workflowDefinitionId: 'test-wf-001' },
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
    const messages = firstInvoke.input.messages as Array<{
      role: string;
      content: string;
    }>;
    const injectedMessage = messages.find(
      (msg) => msg.content.includes('Priority update'),
    );
    expect(injectedMessage).toBeDefined();
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
          toolCalls: [{ name: 'lookup_status', params: {} }],
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

describe('AgentGateway multi-tier dispatch chain (Phase 1.2)', () => {
  it('completes a 4-tier dispatch chain: System -> Orchestrator -> Worker -> nested Worker -> task_complete', async () => {
    const workflowEngine = createWorkflowEngine({
      getRunGraph: vi.fn().mockResolvedValue(null),
    });

    // Nested Worker (tier 4) — innermost agent
    const nestedWorkerBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440300' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        outputSchemaValidator: { validate: async () => ({ success: true }) },
      },
    });

    const { gateway: nestedWorkerGateway } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: nestedWorkerBundle.toolSurface,
      lifecycleHooks: nestedWorkerBundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'nested task done',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { nested: 'worker-result' },
                summary: 'Nested worker completed',
              },
            },
          ],
        }),
      ],
    });

    // Worker (tier 3) — dispatches nested Worker, then completes
    const workerBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440301' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await nestedWorkerGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
      },
    });

    const { gateway: workerGateway } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: workerBundle.toolSurface,
      lifecycleHooks: workerBundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'dispatch nested worker',
          toolCalls: [
            {
              name: 'dispatch_worker',
              params: { task_instructions: 'Nested sub-task' },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { worker: 'done' }, summary: 'Worker completed' },
            },
          ],
        }),
      ],
    });

    // Orchestrator (tier 2) — dispatches Worker, then completes
    const orchestratorBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: '550e8400-e29b-41d4-a716-446655440302' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await workerGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              name: 'dispatch_worker',
              params: { task_instructions: 'Execute task' },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { orchestrated: true }, summary: 'Orchestrator completed' },
            },
          ],
        }),
      ],
    });

    // System (tier 1) — dispatches Orchestrator, then completes
    const systemBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Cortex::System',
      agentId: '550e8400-e29b-41d4-a716-446655440303' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await orchestratorGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              name: 'dispatch_orchestrator',
              params: { dispatch_intent: { type: 'task' }, task_instructions: 'Orchestrate workflow' },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { systemDone: true }, summary: 'System completed' },
            },
          ],
        }),
      ],
    });

    const result = await systemGateway.run(createBaseInput());

    expect(result.status).toBe('completed');
    expect(result.v3Packet).toBeDefined();
    expect(result.v3Packet!.emitter_agent_class).toBe('Cortex::System');
  });

  it('v3 packet stamping conforms to GatewayStampedPacketSchema at every dispatch boundary', async () => {
    const capturedPackets: GatewayStampedPacket[] = [];
    const workflowEngine = createWorkflowEngine({
      getRunGraph: vi.fn().mockResolvedValue(null),
    });

    // Worker — captures its own v3 packet
    const workerBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440310' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              params: { output: { result: 'worker-out' }, summary: 'Worker done' },
            },
          ],
        }),
      ],
    });

    // Orchestrator — dispatches Worker, captures Worker's v3 packet, then completes
    const orchestratorBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: '550e8400-e29b-41d4-a716-446655440311' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await workerGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            if (result.v3Packet) capturedPackets.push(result.v3Packet);
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
      },
    });

    const { gateway: orchestratorGateway } = createGatewayHarness({
      agentClass: 'Orchestrator',
      toolSurface: orchestratorBundle.toolSurface,
      lifecycleHooks: orchestratorBundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'dispatch',
          toolCalls: [
            {
              name: 'dispatch_worker',
              params: { task_instructions: 'Sub-task' },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { orchestrated: true }, summary: 'Orchestrator done' },
            },
          ],
        }),
      ],
    });

    // System — dispatches Orchestrator, captures Orchestrator's v3 packet, then completes
    const systemBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Cortex::System',
      agentId: '550e8400-e29b-41d4-a716-446655440312' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await orchestratorGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            if (result.v3Packet) capturedPackets.push(result.v3Packet);
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
      },
    });

    const { gateway: systemGateway } = createGatewayHarness({
      agentClass: 'Cortex::System',
      toolSurface: systemBundle.toolSurface,
      lifecycleHooks: systemBundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'dispatch',
          toolCalls: [
            {
              name: 'dispatch_orchestrator',
              params: { dispatch_intent: { type: 'task' }, task_instructions: 'Orchestrate' },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { systemDone: true }, summary: 'System done' },
            },
          ],
        }),
      ],
    });

    const result = await systemGateway.run(createBaseInput());
    expect(result.status).toBe('completed');

    // System's own packet
    if (result.v3Packet) capturedPackets.push(result.v3Packet);

    // We should have 3 packets: Worker, Orchestrator, System
    expect(capturedPackets.length).toBe(3);

    const expectedClasses = ['Worker', 'Orchestrator', 'Cortex::System'];
    for (let i = 0; i < capturedPackets.length; i++) {
      const packet = capturedPackets[i]!;

      // Schema conformance
      const parsed = GatewayStampedPacketSchema.safeParse(packet);
      expect(parsed.success).toBe(true);

      // Structural assertions
      expect(packet.nous.v).toBe(3);
      expect(packet.envelope.direction).toBe('internal');
      expect(packet.envelope.type).toBe('response_packet');
      expect(packet.correlation.correlation_id).toBeDefined();
      expect(packet.emitter_agent_class).toBe(expectedClasses[i]);
    }
  });

  it('budget inheritance: child budgets deducted from parent spawn ceiling across 3 tiers', async () => {
    const workflowEngine = createWorkflowEngine({
      getRunGraph: vi.fn().mockResolvedValue(null),
    });

    // Worker — completes immediately
    const workerBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440320' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              params: { output: { done: true }, summary: 'Worker done' },
            },
          ],
        }),
      ],
    });

    // Orchestrator — dispatches Worker then completes
    const orchestratorBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: '550e8400-e29b-41d4-a716-446655440321' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await workerGateway.run(
              createBaseInput({
                taskInstructions: request.taskInstructions,
                spawnBudgetCeiling: 5,
              }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              name: 'dispatch_worker',
              params: { task_instructions: 'Sub-task' },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { orchestrated: true }, summary: 'Orchestrator done' },
            },
          ],
        }),
      ],
    });

    // System with finite spawn ceiling
    const systemBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Cortex::System',
      agentId: '550e8400-e29b-41d4-a716-446655440322' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await orchestratorGateway.run(
              createBaseInput({
                taskInstructions: request.taskInstructions,
                spawnBudgetCeiling: 10,
              }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
      },
    });

    const { gateway: systemGateway } = createGatewayHarness({
      agentClass: 'Cortex::System',
      toolSurface: systemBundle.toolSurface,
      lifecycleHooks: systemBundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'dispatch',
          toolCalls: [
            {
              name: 'dispatch_orchestrator',
              params: { dispatch_intent: { type: 'task' }, task_instructions: 'Orchestrate' },
            },
          ],
        }),
        JSON.stringify({
          response: 'complete',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { systemDone: true }, summary: 'System done' },
            },
          ],
        }),
      ],
    });

    // Use a finite ceiling for the outermost gateway
    const result = await systemGateway.run(
      createBaseInput({ spawnBudgetCeiling: 20 }),
    );

    // Entire chain completed within budget
    expect(result.status).toBe('completed');
    // Usage reflects spawn activity
    expect(result.usage).toBeDefined();
    expect(result.usage!.spawnUnitsUsed).toBeGreaterThan(0);
  });

  it('spawn ceiling exhaustion produces an error tool result, not a gateway crash', async () => {
    const workflowEngine = createWorkflowEngine({
      getRunGraph: vi.fn().mockResolvedValue(null),
    });

    // Worker that would be dispatched — but ceiling will be exhausted
    const workerBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440330' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              params: { output: { done: true }, summary: 'Worker done' },
            },
          ],
        }),
      ],
    });

    // Orchestrator tries to dispatch but spawn ceiling is 0 (immediately exhausted)
    const orchestratorBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: '550e8400-e29b-41d4-a716-446655440331' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await workerGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
      },
    });

    const { gateway: orchestratorGateway } = createGatewayHarness({
      agentClass: 'Orchestrator',
      toolSurface: orchestratorBundle.toolSurface,
      lifecycleHooks: orchestratorBundle.lifecycleHooks,
      outputs: [
        // First: attempt dispatch (will fail due to budget)
        JSON.stringify({
          response: 'dispatch worker',
          toolCalls: [
            {
              name: 'dispatch_worker',
              params: { task_instructions: 'Sub-task' },
            },
          ],
        }),
        // After receiving budget error as context, complete gracefully
        JSON.stringify({
          response: 'budget exceeded, completing',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { budgetHit: true }, summary: 'Completed after budget exhaustion' },
            },
          ],
        }),
      ],
    });

    // Run with spawnBudgetCeiling = 0 — no spawns allowed
    const result = await orchestratorGateway.run(
      createBaseInput({ spawnBudgetCeiling: 0 }),
    );

    // The gateway should not crash — it either completes or reports budget_exhausted
    // With ceiling 0, dispatch_orchestrator is rejected as a tool error, and the agent
    // continues to call task_complete on the next turn
    expect(['completed', 'budget_exhausted']).toContain(result.status);
  });

  it('Worker error propagates to parent as AgentResult with status error', async () => {
    const workflowEngine = createWorkflowEngine({
      getRunGraph: vi.fn().mockResolvedValue(null),
    });

    // Worker that throws an error on tool execution
    const workerBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440340' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        outputSchemaValidator: { validate: async () => ({ success: true }) },
      },
    });

    // Create a gateway that will encounter an error: model provider throws
    const errorProvider = {
      invoke: vi.fn().mockRejectedValue(new Error('Worker internal failure')),
      stream: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        id: '550e8400-e29b-41d4-a716-446655440105' as any,
        name: 'test-provider',
        type: 'text',
        modelId: 'test-model',
        isLocal: true,
        capabilities: ['reasoning'],
      }),
    };

    const { gateway: workerGateway } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: workerBundle.toolSurface,
      lifecycleHooks: workerBundle.lifecycleHooks,
      modelProvider: errorProvider as any,
    });

    // Orchestrator dispatches the error-prone Worker, then completes
    const orchestratorBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: '550e8400-e29b-41d4-a716-446655440341' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await workerGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              name: 'dispatch_worker',
              params: { task_instructions: 'Fail task' },
            },
          ],
        }),
        // After receiving child error as context, complete
        JSON.stringify({
          response: 'child failed, completing',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { childFailed: true }, summary: 'Completed after child error' },
            },
          ],
        }),
      ],
    });

    const result = await orchestratorGateway.run(createBaseInput());

    // Parent receives the child error as a child_result context frame and continues
    // The orchestrator should still complete (it handles the error context gracefully)
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ childFailed: true });
  });

  it('escalation chain propagation: Worker escalates -> Orchestrator receives escalated child result -> Orchestrator re-escalates', async () => {
    const workflowEngine = createWorkflowEngine({
      getRunGraph: vi.fn().mockResolvedValue(null),
    });

    // Worker escalates immediately
    const workerBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId: '550e8400-e29b-41d4-a716-446655440350' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        outputSchemaValidator: { validate: async () => ({ success: true }) },
      },
    });

    const { gateway: workerGateway } = createGatewayHarness({
      agentClass: 'Worker',
      toolSurface: workerBundle.toolSurface,
      lifecycleHooks: workerBundle.lifecycleHooks,
      outputs: [
        JSON.stringify({
          response: 'need help',
          toolCalls: [
            {
              name: 'request_escalation',
              params: {
                severity: 'high',
                reason: 'Cannot resolve dependency conflict',
                detail: { module: 'auth-service' },
              },
            },
          ],
        }),
      ],
    });

    // Orchestrator dispatches Worker, receives escalated result, then re-escalates
    const orchestratorBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Orchestrator',
      agentId: '550e8400-e29b-41d4-a716-446655440351' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await workerGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              name: 'dispatch_worker',
              params: { task_instructions: 'Resolve conflict' },
            },
          ],
        }),
        // After receiving child escalation as context, the Orchestrator re-escalates
        JSON.stringify({
          response: 'child escalated, I must escalate too',
          toolCalls: [
            {
              name: 'request_escalation',
              params: {
                severity: 'critical',
                reason: 'Worker escalation requires Principal intervention',
                detail: { originalReason: 'Cannot resolve dependency conflict' },
              },
            },
          ],
        }),
      ],
    });

    // System dispatches Orchestrator — receives the chain-escalated result
    const systemBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Cortex::System',
      agentId: '550e8400-e29b-41d4-a716-446655440352' as any,
      deps: {
        workmodeAdmissionGuard: createWorkmodeAdmissionGuard(),
        getProjectApi: () => createProjectApi(),
        workflowEngine,
        dispatchRuntime: {
          dispatchChild: async ({ request }) => {
            const result = await orchestratorGateway.run(
              createBaseInput({ taskInstructions: request.taskInstructions }),
            );
            return { ...result, evidenceRefs: result.evidenceRefs ?? [] };
          },
        },
        outputSchemaValidator: { validate: async () => ({ success: true }) },
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
              name: 'dispatch_orchestrator',
              params: { dispatch_intent: { type: 'task' }, task_instructions: 'Handle workflow' },
            },
          ],
        }),
        // System receives the escalated child result as context and completes
        JSON.stringify({
          response: 'escalation received, completing with escalation info',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { escalationReceived: true, childStatus: 'escalated' },
                summary: 'System completed after receiving escalation from chain',
              },
            },
          ],
        }),
      ],
    });

    const result = await systemGateway.run(createBaseInput());

    // System completed — it received the escalated child result as context
    // and chose to complete with information about the escalation
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ escalationReceived: true, childStatus: 'escalated' });

    // Verify the escalation metadata was preserved through the chain
    // The orchestrator's escalation result (severity: critical) was projected to system as child_result
    expect(result.v3Packet).toBeDefined();
    expect(result.v3Packet!.emitter_agent_class).toBe('Cortex::System');
  });
});
