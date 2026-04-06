import { describe, expect, it, vi } from 'vitest';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import {
  createDocumentStore,
  createModelProvider,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

// Helper: create runtime with stmStore and mwcPipeline
function createChatRuntime(args?: {
  principalOutputs?: unknown[];
  stmEntries?: Array<{ role: string; content: string; timestamp: string }>;
}) {
  const stmEntries: Array<{ role: string; content: string; timestamp: string }> = [];
  const stmStore = {
    getContext: vi.fn().mockResolvedValue({
      entries: args?.stmEntries ?? [],
      summary: undefined,
      tokenCount: 0,
    }),
    append: vi.fn().mockImplementation(async (_pid: string, entry: any) => {
      stmEntries.push(entry);
    }),
    compact: vi.fn(),
    clear: vi.fn(),
  };
  const mwcPipeline = {
    mutate: vi.fn().mockResolvedValue({ applied: true, reason: '', reasonCode: '' }),
  };

  const runtime = createPrincipalSystemGatewayRuntime({
    documentStore: createDocumentStore(),
    modelProviderByClass: {
      'Cortex::Principal': createModelProvider(
        args?.principalOutputs ?? [
          JSON.stringify({
            response: '',
            toolCalls: [
              {
                name: 'task_complete',
                params: {
                  output: { response: 'Hello from Principal' },
                  summary: 'chat turn completed',
                },
              },
            ],
          }),
        ],
      ),
      'Cortex::System': createModelProvider(['{"response":"idle","toolCalls":[]}']),
      Orchestrator: createModelProvider(['{"response":"idle","toolCalls":[]}']),
      Worker: createModelProvider(['{"response":"idle","toolCalls":[]}']),
    },
    getProjectApi: () => createProjectApi(),
    pfc: createPfcEngine(),
    outputSchemaValidator: {
      validate: vi.fn().mockResolvedValue({ success: true }),
    },
    stmStore,
    mwcPipeline,
    idFactory: (() => {
      let counter = 0;
      return () => {
        const suffix = String(counter).padStart(12, '0');
        counter += 1;
        return `00000000-0000-4000-8000-${suffix}`;
      };
    })(),
  });

  return { runtime, stmStore, mwcPipeline, stmEntries };
}

describe('PrincipalSystemGatewayRuntime — handleChatTurn', () => {
  it('receives a chat message and returns a response through the Principal gateway', async () => {
    const { runtime } = createChatRuntime();

    const result = await runtime.handleChatTurn({
      message: 'Hello',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.traceId).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('creates STM entries for user message and assistant response after full cycle', async () => {
    const { runtime, stmStore } = createChatRuntime();

    await runtime.handleChatTurn({
      message: 'What is Nous?',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    // stmStore.append should be called at least twice (user + assistant)
    expect(stmStore.append).toHaveBeenCalledTimes(2);
    expect(stmStore.append).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.objectContaining({ role: 'user', content: 'What is Nous?' }),
    );
    expect(stmStore.append).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.objectContaining({ role: 'assistant' }),
    );
  });

  it('loads STM context before running the Principal gateway', async () => {
    const { runtime, stmStore } = createChatRuntime({
      stmEntries: [
        { role: 'user', content: 'Previous message', timestamp: '2026-04-05T00:00:00Z' },
        { role: 'assistant', content: 'Previous reply', timestamp: '2026-04-05T00:00:01Z' },
      ],
    });

    await runtime.handleChatTurn({
      message: 'Follow up',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    expect(stmStore.getContext).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  it('works without stmStore (graceful degradation)', async () => {
    const runtime = createPrincipalSystemGatewayRuntime({
      documentStore: createDocumentStore(),
      modelProviderByClass: {
        'Cortex::Principal': createModelProvider([
          JSON.stringify({
            response: '',
            toolCalls: [
              {
                name: 'task_complete',
                params: { output: { response: 'No STM reply' }, summary: '' },
              },
            ],
          }),
        ]),
        'Cortex::System': createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Orchestrator: createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Worker: createModelProvider(['{"response":"idle","toolCalls":[]}']),
      },
      getProjectApi: () => createProjectApi(),
      pfc: createPfcEngine(),
      outputSchemaValidator: { validate: vi.fn().mockResolvedValue({ success: true }) },
      // No stmStore — deliberate omission
      idFactory: (() => {
        let counter = 0;
        return () => {
          const suffix = String(counter).padStart(12, '0');
          counter += 1;
          return `00000000-0000-4000-8000-${suffix}`;
        };
      })(),
    });

    const result = await runtime.handleChatTurn({
      message: 'Hello without STM',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    expect(result.response).toBeDefined();
    // No error thrown
  });

  it('returns opctl blocked response when project is paused', async () => {
    const opctlService = {
      getProjectControlState: vi.fn().mockResolvedValue('paused_review'),
    };

    const runtime = createPrincipalSystemGatewayRuntime({
      documentStore: createDocumentStore(),
      modelProviderByClass: {
        'Cortex::Principal': createModelProvider(['{"response":"idle","toolCalls":[]}']),
        'Cortex::System': createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Orchestrator: createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Worker: createModelProvider(['{"response":"idle","toolCalls":[]}']),
      },
      getProjectApi: () => createProjectApi(),
      pfc: createPfcEngine(),
      outputSchemaValidator: { validate: vi.fn().mockResolvedValue({ success: true }) },
      opctlService: opctlService as any,
      idFactory: (() => {
        let counter = 0;
        return () => {
          const suffix = String(counter).padStart(12, '0');
          counter += 1;
          return `00000000-0000-4000-8000-${suffix}`;
        };
      })(),
    });

    const result = await runtime.handleChatTurn({
      message: 'Hello',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    expect(result.response).toContain('paused_review');
  });
});
