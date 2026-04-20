import { describe, expect, it, vi } from 'vitest';
import { EMPTY_RESPONSE_MARKER, NARRATE_WITHOUT_DISPATCH_MARKER } from '@nous/shared';
import type { IModelProvider } from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import {
  createDocumentStore,
  createModelProvider,
  createPfcEngine,
  createProjectApi,
  PROVIDER_ID,
  TRACE_ID,
} from '../agent-gateway/helpers.js';

/**
 * SP 1.15 RC-1 — Ollama-shaped provider so the gateway resolves the
 * ollama-adapter (which extracts `thinkingContent` from `message.thinking`).
 * The cortex-runtime tests below need both empty-response branches.
 */
function createOllamaShapedProviderForChat(messages: Array<{ content: string; thinking?: string }>): IModelProvider {
  let i = 0;
  return {
    invoke: vi.fn().mockImplementation(async () => {
      const msg = messages[Math.min(i, messages.length - 1)];
      i += 1;
      const wireMessage: Record<string, unknown> = { role: 'assistant', content: msg.content };
      if (msg.thinking) wireMessage.thinking = msg.thinking;
      return {
        output: wireMessage,
        providerId: PROVIDER_ID,
        usage: { inputTokens: 5, outputTokens: 5 },
        traceId: TRACE_ID,
      };
    }),
    stream: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      id: PROVIDER_ID,
      name: 'ollama-test',
      type: 'ollama',
      vendor: 'ollama',
      modelId: 'gemma3:4b',
      isLocal: true,
      capabilities: ['reasoning'],
    }),
  };
}

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

describe('PrincipalSystemGatewayRuntime — empty_response_kind round-trip (SP 1.15 RC-1)', () => {
  function createRuntimeWithProvider(provider: IModelProvider) {
    const stmAppendCalls: Array<{ pid: string; entry: any }> = [];
    const stmStore = {
      getContext: vi.fn().mockResolvedValue({ entries: [], summary: undefined, tokenCount: 0 }),
      append: vi.fn().mockImplementation(async (pid: string, entry: any) => {
        stmAppendCalls.push({ pid, entry });
      }),
      compact: vi.fn(),
      clear: vi.fn(),
    };
    const runtime = createPrincipalSystemGatewayRuntime({
      documentStore: createDocumentStore(),
      modelProviderByClass: {
        'Cortex::Principal': provider,
        'Cortex::System': createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Orchestrator: createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Worker: createModelProvider(['{"response":"idle","toolCalls":[]}']),
      },
      getProjectApi: () => createProjectApi(),
      pfc: createPfcEngine(),
      outputSchemaValidator: { validate: vi.fn().mockResolvedValue({ success: true }) },
      stmStore,
      idFactory: (() => {
        let counter = 0;
        return () => {
          const suffix = String(counter).padStart(12, '0');
          counter += 1;
          return `00000000-0000-4000-8000-${suffix}`;
        };
      })(),
    });
    return { runtime, stmStore, stmAppendCalls };
  }

  it('propagates empty_response_kind = thinking_only_no_finalizer through ChatTurnResult and STM', async () => {
    const provider = createOllamaShapedProviderForChat([
      { content: '', thinking: 'reasoning trace' },
    ]);
    const { runtime, stmAppendCalls } = createRuntimeWithProvider(provider);

    const result = await runtime.handleChatTurn({
      message: 'Hello',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    // ChatTurnResult round-trip
    expect((result as { empty_response_kind?: string }).empty_response_kind).toBe('thinking_only_no_finalizer');
    expect(result.response).toBe(EMPTY_RESPONSE_MARKER);

    // STM round-trip — assistant entry has marker content + metadata tag
    const assistantAppend = stmAppendCalls.find((c) => c.entry.role === 'assistant');
    expect(assistantAppend).toBeDefined();
    expect(assistantAppend!.entry.content).toBe(EMPTY_RESPONSE_MARKER);
    expect(assistantAppend!.entry.metadata?.empty_response_kind).toBe('thinking_only_no_finalizer');
  });

  it('propagates empty_response_kind = no_output_at_all when neither thinking nor response present', async () => {
    const provider = createOllamaShapedProviderForChat([
      { content: '' }, // no thinking
    ]);
    const { runtime, stmAppendCalls } = createRuntimeWithProvider(provider);

    const result = await runtime.handleChatTurn({
      message: 'Hello',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    expect((result as { empty_response_kind?: string }).empty_response_kind).toBe('no_output_at_all');
    expect(result.response).toBe(EMPTY_RESPONSE_MARKER);

    const assistantAppend = stmAppendCalls.find((c) => c.entry.role === 'assistant');
    expect(assistantAppend!.entry.metadata?.empty_response_kind).toBe('no_output_at_all');
  });

  it('buildChatContextFrames SKIPs STM entries tagged with empty_response_kind (no marker bleed)', async () => {
    // Seed STM with one tagged entry and one normal entry; assert the next
    // turn's context only contains the normal entry.
    const stmStore = {
      getContext: vi.fn().mockResolvedValue({
        entries: [
          {
            role: 'assistant',
            content: EMPTY_RESPONSE_MARKER,
            timestamp: '2026-04-18T00:00:00Z',
            metadata: { empty_response_kind: 'thinking_only_no_finalizer' },
          },
          {
            role: 'user',
            content: 'previous user message',
            timestamp: '2026-04-18T00:00:01Z',
          },
        ],
        summary: undefined,
        tokenCount: 0,
      }),
      append: vi.fn().mockResolvedValue(undefined),
      compact: vi.fn(),
      clear: vi.fn(),
    };

    const principalProvider = createModelProvider([
      JSON.stringify({
        response: 'ok',
        toolCalls: [
          {
            name: 'task_complete',
            params: { output: { response: 'ok' }, summary: 's' },
          },
        ],
      }),
    ]);

    const runtime = createPrincipalSystemGatewayRuntime({
      documentStore: createDocumentStore(),
      modelProviderByClass: {
        'Cortex::Principal': principalProvider,
        'Cortex::System': createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Orchestrator: createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Worker: createModelProvider(['{"response":"idle","toolCalls":[]}']),
      },
      getProjectApi: () => createProjectApi(),
      pfc: createPfcEngine(),
      outputSchemaValidator: { validate: vi.fn().mockResolvedValue({ success: true }) },
      stmStore,
      idFactory: (() => {
        let counter = 0;
        return () => {
          const suffix = String(counter).padStart(12, '0');
          counter += 1;
          return `00000000-0000-4000-8000-${suffix}`;
        };
      })(),
    });

    await runtime.handleChatTurn({
      message: 'Follow up',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    // Inspect what the principal provider was actually called with — its
    // context frames should NOT contain the marker entry.
    const invokeArgs = (principalProvider.invoke as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const contextFrames = (invokeArgs.input.context ?? []) as Array<{ role: string; content: string }>;
    // Must contain the normal user entry but NOT the marker
    expect(contextFrames.some((f) => f.content === 'previous user message')).toBe(true);
    expect(contextFrames.some((f) => f.content === EMPTY_RESPONSE_MARKER)).toBe(false);
  });

  it('regression — non-empty assistant response leaves empty_response_kind undefined on ChatTurnResult', async () => {
    const provider = createOllamaShapedProviderForChat([
      { content: 'Normal reply.' },
    ]);
    const { runtime } = createRuntimeWithProvider(provider);

    const result = await runtime.handleChatTurn({
      message: 'Hello',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    expect((result as { empty_response_kind?: string }).empty_response_kind).toBeUndefined();
    expect(result.response).toBe('Normal reply.');
  });
});

describe('PrincipalSystemGatewayRuntime — narrate_without_dispatch round-trip (SP 1.16 RC-β.1)', () => {
  it('SKIPs STM entries tagged with empty_response_kind = narrate_without_dispatch on next turn', async () => {
    const stmStore = {
      getContext: vi.fn().mockResolvedValue({
        entries: [
          {
            role: 'assistant',
            content: NARRATE_WITHOUT_DISPATCH_MARKER,
            timestamp: '2026-04-18T00:00:00Z',
            metadata: { empty_response_kind: 'narrate_without_dispatch' },
          },
          {
            role: 'user',
            content: 'previous user message',
            timestamp: '2026-04-18T00:00:01Z',
          },
        ],
        summary: undefined,
        tokenCount: 0,
      }),
      append: vi.fn().mockResolvedValue(undefined),
      compact: vi.fn(),
      clear: vi.fn(),
    };

    const principalProvider = createModelProvider([
      JSON.stringify({
        response: 'ok',
        toolCalls: [
          {
            name: 'task_complete',
            params: { output: { response: 'ok' }, summary: 's' },
          },
        ],
      }),
    ]);

    const runtime = createPrincipalSystemGatewayRuntime({
      documentStore: createDocumentStore(),
      modelProviderByClass: {
        'Cortex::Principal': principalProvider,
        'Cortex::System': createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Orchestrator: createModelProvider(['{"response":"idle","toolCalls":[]}']),
        Worker: createModelProvider(['{"response":"idle","toolCalls":[]}']),
      },
      getProjectApi: () => createProjectApi(),
      pfc: createPfcEngine(),
      outputSchemaValidator: { validate: vi.fn().mockResolvedValue({ success: true }) },
      stmStore,
      idFactory: (() => {
        let counter = 0;
        return () => {
          const suffix = String(counter).padStart(12, '0');
          counter += 1;
          return `00000000-0000-4000-8000-${suffix}`;
        };
      })(),
    });

    await runtime.handleChatTurn({
      message: 'Follow up',
      projectId: '00000000-0000-4000-8000-000000000001',
      traceId: '00000000-0000-4000-8000-000000000099',
    });

    const invokeArgs = (principalProvider.invoke as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const contextFrames = (invokeArgs.input.context ?? []) as Array<{ role: string; content: string }>;
    expect(contextFrames.some((f) => f.content === 'previous user message')).toBe(true);
    // SP 1.15 SKIP policy applies to the new discriminator too — Invariant I-13 preserved.
    expect(contextFrames.some((f) => f.content === NARRATE_WITHOUT_DISPATCH_MARKER)).toBe(false);
  });
});
