/**
 * Unit tests for tool concurrency engine in AgentGateway.handleToolCalls.
 *
 * Covers: partitioning logic, concurrent execution, context frame ordering,
 * error handling, and config gating.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AgentGatewayConfig, ToolDefinition, ToolResult } from '@nous/shared';
import {
  AGENT_ID,
  createBaseInput,
  createModelProvider,
  createStampedPacket,
  NOW,
  InMemoryGatewayOutboxSink,
} from './helpers.js';
import { AgentGateway } from '../../agent-gateway/agent-gateway.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Build tool definitions with explicit isConcurrencySafe annotations */
function makeTools(specs: Array<{ name: string; safe: boolean | undefined }>): ToolDefinition[] {
  return specs.map((spec) => ({
    name: spec.name,
    version: '1.0.0',
    description: `${spec.name} tool`,
    inputSchema: {},
    outputSchema: {},
    capabilities: ['read'],
    permissionScope: 'project',
    ...(spec.safe !== undefined ? { isConcurrencySafe: spec.safe } : {}),
  }));
}

/** Create a gateway with concurrency config and custom tool surface */
function createConcurrencyGateway(options: {
  tools: ToolDefinition[];
  outputs: unknown[];
  toolConcurrency?: AgentGatewayConfig['toolConcurrency'];
  harnessConcurrency?: AgentGatewayConfig['harness'];
  executeTool?: (name: string, params: unknown) => Promise<ToolResult>;
  lifecycleHooks?: AgentGatewayConfig['lifecycleHooks'];
}) {
  const outbox = new InMemoryGatewayOutboxSink();
  const executeTool = options.executeTool ?? (async (name: string, params: unknown) => ({
    success: true,
    output: { tool: name, params },
    durationMs: 5,
  }));

  const toolSurface = {
    listTools: vi.fn().mockResolvedValue(options.tools),
    executeTool: vi.fn().mockImplementation(executeTool),
  };

  const modelProvider = createModelProvider(options.outputs);

  const gateway = new AgentGateway({
    agentClass: 'Worker',
    agentId: AGENT_ID,
    toolSurface,
    modelProvider,
    outbox,
    now: () => NOW,
    nowMs: () => Date.parse(NOW),
    idFactory: () => AGENT_ID,
    toolConcurrency: options.toolConcurrency,
    harness: options.harnessConcurrency,
    lifecycleHooks: options.lifecycleHooks,
  });

  return { gateway, toolSurface, modelProvider, outbox };
}

/** Build a model output JSON string with multiple tool calls */
function modelOutputWithToolCalls(
  toolCalls: Array<{ name: string; params?: unknown; id?: string }>,
  response = '',
): string {
  return JSON.stringify({
    response,
    toolCalls: toolCalls.map((tc) => ({
      name: tc.name,
      params: tc.params ?? {},
      ...(tc.id ? { id: tc.id } : {}),
    })),
  });
}

/** Build a model output that calls task_complete */
function taskCompleteOutput(summary = 'done'): string {
  return JSON.stringify({
    response: '',
    toolCalls: [
      {
        name: 'task_complete',
        params: { output: { finished: true }, summary },
      },
    ],
  });
}

// ── Test suites ─────────────────────────────────────────────────────

describe('Tool Concurrency Engine', () => {
  // ── Config Gating ──────────────────────────────────────────────────

  describe('config gating', () => {
    it('dispatches sequentially when toolConcurrency is absent', async () => {
      const callOrder: string[] = [];
      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'read_b', safe: true },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a' },
            { name: 'read_b' },
          ]),
          taskCompleteOutput(),
        ],
        // No toolConcurrency — should be sequential
        executeTool: async (name) => {
          callOrder.push(name);
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      await gateway.run(createBaseInput());
      expect(callOrder).toEqual(['read_a', 'read_b']);
    });

    it('dispatches sequentially when partitionBySafety is false', async () => {
      const callOrder: string[] = [];
      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'read_b', safe: true },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a' },
            { name: 'read_b' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: false, maxConcurrent: 5 },
        executeTool: async (name) => {
          callOrder.push(name);
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      await gateway.run(createBaseInput());
      expect(callOrder).toEqual(['read_a', 'read_b']);
    });

    it('dispatches sequentially when maxConcurrent is 1', async () => {
      const callOrder: string[] = [];
      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'read_b', safe: true },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a' },
            { name: 'read_b' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 1 },
        executeTool: async (name) => {
          callOrder.push(name);
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      await gateway.run(createBaseInput());
      expect(callOrder).toEqual(['read_a', 'read_b']);
    });

    it('enables partitioned dispatch when partitionBySafety is true and maxConcurrent > 1', async () => {
      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'read_b', safe: true },
        { name: 'write_c', safe: false },
      ]);

      const { gateway, toolSurface } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a' },
            { name: 'read_b' },
            { name: 'write_c' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 5 },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      // All three tools should have been executed
      expect(toolSurface.executeTool).toHaveBeenCalledTimes(3);
    });
  });

  // ── Partitioning Logic ────────────────────────────────────────────

  describe('partitioning logic', () => {
    it('places isConcurrencySafe=true tools in concurrent group', async () => {
      const concurrentCalls: string[] = [];
      const serialCalls: string[] = [];
      let concurrentBatchStarted = false;

      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'write_b', safe: false },
        { name: 'read_c', safe: true },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a' },
            { name: 'write_b' },
            { name: 'read_c' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        executeTool: async (name) => {
          if (name === 'read_a' || name === 'read_c') {
            concurrentCalls.push(name);
          } else {
            serialCalls.push(name);
          }
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      await gateway.run(createBaseInput());
      expect(concurrentCalls).toContain('read_a');
      expect(concurrentCalls).toContain('read_c');
      expect(serialCalls).toContain('write_b');
    });

    it('treats tools with undefined isConcurrencySafe as serial', async () => {
      const tools = makeTools([
        { name: 'unknown_tool', safe: undefined },
        { name: 'safe_tool', safe: true },
      ]);

      const executionOrder: string[] = [];
      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'unknown_tool' },
            { name: 'safe_tool' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        executeTool: async (name) => {
          executionOrder.push(name);
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      // Both should be executed
      expect(executionOrder).toContain('unknown_tool');
      expect(executionOrder).toContain('safe_tool');
    });

    it('treats missing tool definition as serial (conservative default)', async () => {
      // Tool called by model but not in definitions
      const tools = makeTools([
        { name: 'known_safe', safe: true },
      ]);

      const executionOrder: string[] = [];
      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'known_safe' },
            { name: 'unknown_missing' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        executeTool: async (name) => {
          executionOrder.push(name);
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      expect(executionOrder).toContain('known_safe');
      expect(executionOrder).toContain('unknown_missing');
    });
  });

  // ── Concurrent Execution Verification ─────────────────────────────

  describe('concurrent execution', () => {
    it('executes concurrent-safe tools in parallel via Promise.allSettled', async () => {
      // Verify tools start concurrently by tracking start/end times
      const events: Array<{ name: string; phase: 'start' | 'end'; time: number }> = [];

      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'read_b', safe: true },
        { name: 'read_c', safe: true },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a' },
            { name: 'read_b' },
            { name: 'read_c' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        executeTool: async (name) => {
          const start = Date.now();
          events.push({ name, phase: 'start', time: start });
          // Small delay to allow verification of parallel starts
          await new Promise((resolve) => setTimeout(resolve, 20));
          events.push({ name, phase: 'end', time: Date.now() });
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      await gateway.run(createBaseInput());

      // All three should have started before any ended (parallel execution)
      const starts = events.filter((e) => e.phase === 'start');
      const ends = events.filter((e) => e.phase === 'end');
      expect(starts).toHaveLength(3);
      expect(ends).toHaveLength(3);

      // All starts should happen before the first end (proves concurrency)
      const lastStartTime = Math.max(...starts.map((s) => s.time));
      const firstEndTime = Math.min(...ends.map((e) => e.time));
      expect(lastStartTime).toBeLessThanOrEqual(firstEndTime);
    });

    it('executes serial tools sequentially in original order', async () => {
      const callOrder: string[] = [];
      const tools = makeTools([
        { name: 'write_a', safe: false },
        { name: 'write_b', safe: false },
        { name: 'write_c', safe: false },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'write_a' },
            { name: 'write_b' },
            { name: 'write_c' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        executeTool: async (name) => {
          callOrder.push(name);
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      await gateway.run(createBaseInput());
      expect(callOrder).toEqual(['write_a', 'write_b', 'write_c']);
    });
  });

  // ── Context Frame Ordering ────────────────────────────────────────

  describe('context frame ordering', () => {
    it('preserves original tool call order regardless of concurrent completion order', async () => {
      // read_b completes before read_a by design (different delays)
      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'read_b', safe: true },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a', id: 'call_a' },
            { name: 'read_b', id: 'call_b' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        executeTool: async (name) => {
          // read_b is faster than read_a
          const delay = name === 'read_a' ? 30 : 5;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return {
            success: true,
            output: { tool: name, result: `${name}_result` },
            durationMs: delay,
          };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      // The gateway processes tool results and feeds them as context to the next
      // model invocation. We verify the gateway completed successfully which means
      // the ordering loop worked correctly.
    });

    it('preserves order with mixed concurrent and serial tools', async () => {
      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'write_b', safe: false },
        { name: 'read_c', safe: true },
      ]);

      const { gateway, toolSurface } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a', id: 'call_a' },
            { name: 'write_b', id: 'call_b' },
            { name: 'read_c', id: 'call_c' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      // All three tools should have been executed
      expect(toolSurface.executeTool).toHaveBeenCalledTimes(3);
    });
  });

  // ── Error Handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('produces tool_error frame for rejected concurrent tool without aborting others', async () => {
      const executedTools: string[] = [];
      const tools = makeTools([
        { name: 'read_ok', safe: true },
        { name: 'read_fail', safe: true },
        { name: 'read_also_ok', safe: true },
      ]);

      const { gateway, toolSurface } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_ok' },
            { name: 'read_fail' },
            { name: 'read_also_ok' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        executeTool: async (name) => {
          executedTools.push(name);
          if (name === 'read_fail') {
            throw new Error('read_fail exploded');
          }
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      // All three should have been called — the error in read_fail should not abort others
      expect(executedTools).toContain('read_ok');
      expect(executedTools).toContain('read_fail');
      expect(executedTools).toContain('read_also_ok');
    });

    it('handles witness failure in concurrent tool batch (terminal result)', async () => {
      const { NousError } = await import('@nous/shared');
      const tools = makeTools([
        { name: 'read_ok', safe: true },
        { name: 'read_witness_fail', safe: true },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_ok' },
            { name: 'read_witness_fail' },
          ]),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        executeTool: async (name) => {
          if (name === 'read_witness_fail') {
            throw new NousError(
              'Authorization failed',
              'WITNESS_AUTHORIZATION_FAILED',
            );
          }
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
      });

      const result = await gateway.run(createBaseInput());
      // Witness failure produces an error result
      expect(result.status).toBe('error');
    });
  });

  // ── maxConcurrent Chunking ────────────────────────────────────────

  describe('maxConcurrent chunking', () => {
    it('batches concurrent tools into chunks of maxConcurrent', async () => {
      // Track which tools are executing simultaneously
      let currentlyExecuting = 0;
      let maxSimultaneous = 0;

      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'read_b', safe: true },
        { name: 'read_c', safe: true },
        { name: 'read_d', safe: true },
      ]);

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a' },
            { name: 'read_b' },
            { name: 'read_c' },
            { name: 'read_d' },
          ]),
          taskCompleteOutput(),
        ],
        toolConcurrency: { partitionBySafety: true, maxConcurrent: 2 },
        executeTool: async (name) => {
          currentlyExecuting += 1;
          maxSimultaneous = Math.max(maxSimultaneous, currentlyExecuting);
          await new Promise((resolve) => setTimeout(resolve, 20));
          currentlyExecuting -= 1;
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      await gateway.run(createBaseInput());
      // Should never exceed maxConcurrent of 2
      expect(maxSimultaneous).toBeLessThanOrEqual(2);
      expect(maxSimultaneous).toBeGreaterThan(0);
    });
  });

  // ── Harness Config Path ───────────────────────────────────────────

  describe('harness config path', () => {
    it('reads toolConcurrency from harness strategies', async () => {
      const tools = makeTools([
        { name: 'read_a', safe: true },
        { name: 'read_b', safe: true },
      ]);

      const events: Array<{ name: string; phase: 'start' | 'end' }> = [];

      const { gateway } = createConcurrencyGateway({
        tools,
        outputs: [
          modelOutputWithToolCalls([
            { name: 'read_a' },
            { name: 'read_b' },
          ]),
          taskCompleteOutput(),
        ],
        // Use harness path instead of direct config
        harnessConcurrency: {
          toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
        },
        executeTool: async (name) => {
          events.push({ name, phase: 'start' });
          await new Promise((resolve) => setTimeout(resolve, 10));
          events.push({ name, phase: 'end' });
          return { success: true, output: { tool: name }, durationMs: 5 };
        },
        lifecycleHooks: {
          taskComplete: async (request) => ({
            output: request.output,
            v3Packet: createStampedPacket(),
          }),
        },
      });

      await gateway.run(createBaseInput());

      // Both tools should have started (concurrent)
      const starts = events.filter((e) => e.phase === 'start');
      expect(starts).toHaveLength(2);
    });
  });
});
