import { describe, expect, it } from 'vitest';
import { createInternalMcpSurfaceBundle } from '../../internal-mcp/index.js';
import {
  createBaseInput,
  createGatewayHarness,
  createProjectApi,
} from './helpers.js';

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
              v3Packet: { nous: { v: 3 } },
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
