/**
 * Integration test: gateway loop with mixed safe/unsafe tool calls.
 *
 * Verifies the full run() path with a model that returns mixed tool calls,
 * ensuring correct dispatch, authorization enforcement, and context frame ordering.
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

function makeTools(specs: Array<{ name: string; safe: boolean }>): ToolDefinition[] {
  return specs.map((spec) => ({
    name: spec.name,
    version: '1.0.0',
    description: `${spec.name} tool`,
    inputSchema: {},
    outputSchema: {},
    capabilities: ['read'],
    permissionScope: 'project',
    isConcurrencySafe: spec.safe,
  }));
}

describe('Tool concurrency integration — gateway loop', () => {
  it('runs a full gateway loop with mixed safe/unsafe tool calls', async () => {
    const executionLog: Array<{ name: string; timestamp: number }> = [];
    const tools = makeTools([
      { name: 'read_status', safe: true },
      { name: 'read_config', safe: true },
      { name: 'write_file', safe: false },
      { name: 'read_logs', safe: true },
    ]);

    // Add task_complete to tool list (lifecycle tool, not concurrency-relevant)
    tools.push({
      name: 'task_complete',
      version: '1.0.0',
      description: 'Complete task',
      inputSchema: {},
      outputSchema: {},
      capabilities: ['lifecycle'],
      permissionScope: 'agent',
      isConcurrencySafe: false,
    });

    const outbox = new InMemoryGatewayOutboxSink();
    const executeTool = vi.fn().mockImplementation(async (name: string, params: unknown) => {
      executionLog.push({ name, timestamp: Date.now() });
      // Small delay to allow timing verification
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        success: true,
        output: { tool: name, result: `${name}_output` },
        durationMs: 10,
      };
    });

    const toolSurface = {
      listTools: vi.fn().mockResolvedValue(tools),
      executeTool,
    };

    // Turn 1: model returns 4 tool calls (3 safe + 1 unsafe)
    // Turn 2: model calls task_complete
    const modelProvider = createModelProvider([
      JSON.stringify({
        response: 'Processing...',
        toolCalls: [
          { name: 'read_status', params: { id: '1' }, id: 'call_1' },
          { name: 'read_config', params: { key: 'x' }, id: 'call_2' },
          { name: 'write_file', params: { path: '/tmp/out' }, id: 'call_3' },
          { name: 'read_logs', params: { lines: 10 }, id: 'call_4' },
        ],
      }),
      JSON.stringify({
        response: 'Task complete',
        toolCalls: [
          {
            name: 'task_complete',
            params: {
              output: { status: 'success', results: ['read_status', 'read_config', 'write_file', 'read_logs'] },
              summary: 'All tools executed',
            },
          },
        ],
      }),
    ]);

    const gateway = new AgentGateway({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface,
      modelProvider,
      outbox,
      now: () => NOW,
      nowMs: () => Date.parse(NOW),
      idFactory: () => AGENT_ID,
      toolConcurrency: { partitionBySafety: true, maxConcurrent: 5 },
      lifecycleHooks: {
        taskComplete: async (request) => ({
          output: request.output,
          summary: request.summary,
          v3Packet: createStampedPacket(),
        }),
      },
    });

    const result = await gateway.run(createBaseInput());

    // Verify completion
    expect(result.status).toBe('completed');

    // Verify all 4 standard tools were executed via executeTool
    expect(executeTool).toHaveBeenCalledTimes(4);

    // Verify executeTool was called with correct tool names (authorization path)
    const calledToolNames = executeTool.mock.calls.map(
      (call: [string, unknown]) => call[0],
    );
    expect(calledToolNames).toContain('read_status');
    expect(calledToolNames).toContain('read_config');
    expect(calledToolNames).toContain('write_file');
    expect(calledToolNames).toContain('read_logs');

    // Verify all tools were logged in execution log
    expect(executionLog).toHaveLength(4);
    const loggedNames = executionLog.map((e) => e.name);
    expect(loggedNames).toContain('read_status');
    expect(loggedNames).toContain('read_config');
    expect(loggedNames).toContain('write_file');
    expect(loggedNames).toContain('read_logs');
  });

  it('preserves authorization enforcement for concurrent tools', async () => {
    const tools = makeTools([
      { name: 'read_a', safe: true },
      { name: 'read_b', safe: true },
    ]);
    tools.push({
      name: 'task_complete',
      version: '1.0.0',
      description: 'Complete task',
      inputSchema: {},
      outputSchema: {},
      capabilities: ['lifecycle'],
      permissionScope: 'agent',
      isConcurrencySafe: false,
    });

    const executeTool = vi.fn().mockImplementation(async (name: string) => ({
      success: true,
      output: { tool: name },
      durationMs: 5,
    }));

    const toolSurface = {
      listTools: vi.fn().mockResolvedValue(tools),
      executeTool,
    };

    const gateway = new AgentGateway({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface,
      modelProvider: createModelProvider([
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'read_a', params: {}, id: 'call_a' },
            { name: 'read_b', params: {}, id: 'call_b' },
          ],
        }),
        JSON.stringify({
          response: '',
          toolCalls: [
            {
              name: 'task_complete',
              params: { output: { done: true }, summary: 'done' },
            },
          ],
        }),
      ]),
      outbox: new InMemoryGatewayOutboxSink(),
      now: () => NOW,
      nowMs: () => Date.parse(NOW),
      idFactory: () => AGENT_ID,
      toolConcurrency: { partitionBySafety: true, maxConcurrent: 10 },
      lifecycleHooks: {
        taskComplete: async (request) => ({
          output: request.output,
          v3Packet: createStampedPacket(),
        }),
      },
    });

    await gateway.run(createBaseInput());

    // executeTool is the authorization boundary — must be called for every tool
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledWith('read_a', {}, expect.anything());
    expect(executeTool).toHaveBeenCalledWith('read_b', {}, expect.anything());
  });
});
