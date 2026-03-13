import { describe, expect, it } from 'vitest';
import { createInternalMcpSurfaceBundle } from '../../internal-mcp/index.js';
import {
  createBaseInput,
  createGatewayHarness,
  createProjectApi,
} from './helpers.js';

function createStampedPacket() {
  return {
    nous: { v: 3 },
    route: {
      emitter: { id: 'internal-mcp::worker::node-test::task-complete' },
      target: { id: 'internal-mcp::parent::run-test::receive-task-complete' },
    },
    envelope: {
      direction: 'internal' as const,
      type: 'response_packet' as const,
    },
    correlation: {
      handoff_id: 'handoff-1',
      correlation_id: createBaseInput().correlation.runId,
      cycle: 'n/a',
      emitted_at_utc: '2026-03-12T19:00:00.000Z',
      emitted_at_unix_ms: '1773342000000',
      emitted_at_unix_us: '1773342000000000',
      sequence_in_run: '1',
    },
    payload: {
      schema: 'n/a',
      artifact_type: 'n/a',
      data: { done: true },
    },
    retry: {
      policy: 'value-proportional' as const,
      depth: 'lightweight' as const,
      importance_tier: 'standard' as const,
      expected_quality_gain: 'n/a',
      estimated_tokens: 'n/a',
      estimated_compute_minutes: 'n/a',
      token_price_ref: 'runtime:gateway',
      compute_price_ref: 'runtime:gateway',
      decision: 'accept' as const,
      decision_log_ref: 'runtime:gateway/task-complete',
      benchmark_tier: 'n/a' as const,
      self_repair: {
        required_on_fail_close: true as const,
        orchestration_state: 'deferred' as const,
        approval_role: 'Cortex:System',
        implementation_mode: 'direct' as const,
        plan_ref: 'runtime:gateway/self-repair',
      },
    },
  };
}

describe('AgentGateway lifecycle integration', () => {
  it('executes multiple dispatch_agent calls concurrently and preserves result order', async () => {
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
              name: 'dispatch_agent',
              params: {
                target_class: 'Worker',
                task_instructions: 'child-one',
              },
            },
            {
              name: 'dispatch_agent',
              params: {
                target_class: 'Worker',
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
    const childFrames = (secondInvoke.input.context as Array<{ source: string; content: string }>).filter(
      (frame) => frame.source === 'child_result',
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
});
