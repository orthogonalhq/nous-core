import { describe, expect, it, vi } from 'vitest';
import { AgentResultSchema } from '@nous/shared';
import type { AgentGatewayConfig, HarnessStrategies, PromptFormatterOutput } from '@nous/shared';
import {
  AGENT_ID,
  NOW,
  RUN_ID,
  createBaseInput,
  createGatewayHarness,
  createModelProvider,
  createToolSurface,
  createStampedPacket,
} from './helpers.js';
import { AgentGateway } from '../../agent-gateway/agent-gateway.js';
import { InMemoryGatewayOutboxSink } from '../../agent-gateway/outbox.js';

function taskCompleteOutput() {
  return JSON.stringify({
    response: 'task done',
    toolCalls: [{ name: 'task_complete', params: { output: { done: true }, summary: 'Done' } }],
  });
}

function lifecycleHooksWithTaskComplete() {
  return {
    taskComplete: async (request: any) => ({
      output: request.output,
      summary: request.summary,
      v3Packet: createStampedPacket(),
    }),
  };
}

describe('AgentGateway harness delegation', () => {
  describe('regression — no harness config', () => {
    it('completes normally when harness is undefined', async () => {
      const { gateway } = createGatewayHarness({
        outputs: [taskCompleteOutput()],
        lifecycleHooks: lifecycleHooksWithTaskComplete(),
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
    });
  });

  describe('promptFormatter delegation', () => {
    it('calls promptFormatter when present and uses its systemPrompt', async () => {
      const promptFormatter = vi.fn().mockReturnValue({
        systemPrompt: 'Custom formatted prompt',
        toolDefinitions: undefined,
      } satisfies PromptFormatterOutput);

      const outbox = new InMemoryGatewayOutboxSink();
      const gateway = new AgentGateway({
        agentClass: 'Worker',
        agentId: AGENT_ID,
        toolSurface: createToolSurface(),
        modelProvider: createModelProvider([taskCompleteOutput()]),
        harness: { promptFormatter },
        lifecycleHooks: lifecycleHooksWithTaskComplete(),
        outbox,
        now: () => NOW,
        nowMs: () => Date.parse(NOW),
        idFactory: () => AGENT_ID,
      });

      const result = await gateway.run(createBaseInput());
      expect(promptFormatter).toHaveBeenCalled();
      expect(result.status).toBe('completed');

      // Verify the formatter received correct input shape
      const call = promptFormatter.mock.calls[0][0];
      expect(call.agentClass).toBe('Worker');
      expect(call.taskInstructions).toBe('Complete the assigned task.');
    });
  });

  describe('responseParser delegation', () => {
    it('calls responseParser when present and uses its result', async () => {
      const responseParser = vi.fn().mockReturnValue({
        response: 'parsed by custom parser',
        toolCalls: [{ name: 'task_complete', params: { output: { done: true }, summary: 'Done' } }],
        memoryCandidates: [],
        contentType: 'text',
      });

      const outbox = new InMemoryGatewayOutboxSink();
      const gateway = new AgentGateway({
        agentClass: 'Worker',
        agentId: AGENT_ID,
        toolSurface: createToolSurface(),
        modelProvider: createModelProvider(['raw model output']),
        harness: { responseParser },
        lifecycleHooks: lifecycleHooksWithTaskComplete(),
        outbox,
        now: () => NOW,
        nowMs: () => Date.parse(NOW),
        idFactory: () => AGENT_ID,
      });

      const result = await gateway.run(createBaseInput());
      expect(responseParser).toHaveBeenCalled();
      expect(result.status).toBe('completed');
    });
  });

  describe('single-turn exit', () => {
    it('returns AgentResult with status completed after one model invocation', async () => {
      const modelProvider = createModelProvider(['Hello, I am a single-turn response.']);
      const outbox = new InMemoryGatewayOutboxSink();

      const gateway = new AgentGateway({
        agentClass: 'Cortex::Principal',
        agentId: AGENT_ID,
        toolSurface: createToolSurface(undefined, []),
        modelProvider,
        harness: { loopConfig: { singleTurn: true } },
        outbox,
        now: () => NOW,
        nowMs: () => Date.parse(NOW),
        idFactory: () => AGENT_ID,
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      expect(modelProvider.invoke).toHaveBeenCalledTimes(1);
    });

    it('result passes AgentResultSchema validation', async () => {
      const outbox = new InMemoryGatewayOutboxSink();
      const gateway = new AgentGateway({
        agentClass: 'Cortex::Principal',
        agentId: AGENT_ID,
        toolSurface: createToolSurface(undefined, []),
        modelProvider: createModelProvider(['Valid response.']),
        harness: { loopConfig: { singleTurn: true } },
        outbox,
        now: () => NOW,
        nowMs: () => Date.parse(NOW),
        idFactory: () => AGENT_ID,
      });

      const result = await gateway.run(createBaseInput());
      const parsed = AgentResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('result output.response contains model response text', async () => {
      const outbox = new InMemoryGatewayOutboxSink();
      const gateway = new AgentGateway({
        agentClass: 'Cortex::Principal',
        agentId: AGENT_ID,
        toolSurface: createToolSurface(undefined, []),
        modelProvider: createModelProvider(['The actual response text.']),
        harness: { loopConfig: { singleTurn: true } },
        outbox,
        now: () => NOW,
        nowMs: () => Date.parse(NOW),
        idFactory: () => AGENT_ID,
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        const output = result.output as { response: string };
        expect(output.response).toBe('The actual response text.');
      }
    });

    it('does not perform tool handling with singleTurn', async () => {
      const toolSurface = createToolSurface();
      const outbox = new InMemoryGatewayOutboxSink();
      const gateway = new AgentGateway({
        agentClass: 'Cortex::Principal',
        agentId: AGENT_ID,
        toolSurface,
        modelProvider: createModelProvider([
          JSON.stringify({ response: 'response', toolCalls: [{ name: 'some_tool', params: {} }] }),
        ]),
        harness: { loopConfig: { singleTurn: true } },
        outbox,
        now: () => NOW,
        nowMs: () => Date.parse(NOW),
        idFactory: () => AGENT_ID,
      });

      const result = await gateway.run(createBaseInput());
      expect(result.status).toBe('completed');
      // Tool should NOT be executed in single-turn mode
      expect(toolSurface.executeTool).not.toHaveBeenCalled();
    });
  });

  describe('no single-turn (default)', () => {
    it('continues normal loop behavior when singleTurn is false', async () => {
      const outbox = new InMemoryGatewayOutboxSink();
      const gateway = new AgentGateway({
        agentClass: 'Worker',
        agentId: AGENT_ID,
        toolSurface: createToolSurface(),
        modelProvider: createModelProvider([taskCompleteOutput()]),
        harness: { loopConfig: { singleTurn: false } },
        lifecycleHooks: lifecycleHooksWithTaskComplete(),
        outbox,
        now: () => NOW,
        nowMs: () => Date.parse(NOW),
        idFactory: () => AGENT_ID,
      });

      const result = await gateway.run(createBaseInput());
      // Should complete normally through task_complete, not single-turn exit
      expect(result.status).toBe('completed');
    });
  });

  describe('mixed strategies', () => {
    it('uses promptFormatter but falls back to parseModelOutput for response parsing', async () => {
      const promptFormatter = vi.fn().mockReturnValue({
        systemPrompt: 'Custom prompt',
        toolDefinitions: undefined,
      });

      const outbox = new InMemoryGatewayOutboxSink();
      const gateway = new AgentGateway({
        agentClass: 'Worker',
        agentId: AGENT_ID,
        toolSurface: createToolSurface(),
        modelProvider: createModelProvider([taskCompleteOutput()]),
        harness: {
          promptFormatter,
          // responseParser intentionally omitted — falls back to parseModelOutput
        },
        lifecycleHooks: lifecycleHooksWithTaskComplete(),
        outbox,
        now: () => NOW,
        nowMs: () => Date.parse(NOW),
        idFactory: () => AGENT_ID,
      });

      const result = await gateway.run(createBaseInput());
      expect(promptFormatter).toHaveBeenCalled();
      expect(result.status).toBe('completed');
    });
  });
});
