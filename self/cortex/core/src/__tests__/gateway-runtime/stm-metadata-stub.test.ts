import { describe, expect, it, vi } from 'vitest';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import {
  createDocumentStore,
  createModelProvider,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

// Helper: create runtime with stmStore and optional model output configuration
function createChatRuntime(args?: {
  principalOutputs?: unknown[];
  stmEntries?: Array<{ role: string; content: string; timestamp: string }>;
}) {
  const stmEntries: Array<any> = [];
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

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const TRACE_ID = '00000000-0000-4000-8000-000000000099';
const SESSION_ID = '00000000-0000-4000-8000-aaaaaaaaaaaa';

describe('STM Metadata Stub — finalizeChatStmTurn metadata storage', () => {
  // ── Tier 2: Behavior — PrincipalSystemRuntime (CortexRuntime path) ──────

  it('stores sessionId and scope on user entry metadata', async () => {
    const { runtime, stmStore } = createChatRuntime();

    await runtime.handleChatTurn({
      message: 'Hello',
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
    });

    // First append call is the user entry
    const userAppendCall = stmStore.append.mock.calls[0];
    expect(userAppendCall[1].metadata).toBeDefined();
    expect(userAppendCall[1].metadata.sessionId).toBe(SESSION_ID);
    expect(userAppendCall[1].metadata.scope).toBe('principal');
  });

  it('stores sessionId and scope on assistant entry metadata', async () => {
    const { runtime, stmStore } = createChatRuntime();

    await runtime.handleChatTurn({
      message: 'Hello',
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
    });

    // Second append call is the assistant entry
    const assistantAppendCall = stmStore.append.mock.calls[1];
    expect(assistantAppendCall[1].metadata).toBeDefined();
    expect(assistantAppendCall[1].metadata.sessionId).toBe(SESSION_ID);
    expect(assistantAppendCall[1].metadata.scope).toBe('principal');
  });

  // ── Tier 3: Edge cases ─────────────────────────────────────────────────

  it('does not store thinkingContent in metadata when it is undefined', async () => {
    const { runtime, stmStore } = createChatRuntime();

    await runtime.handleChatTurn({
      message: 'Hello',
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
    });

    // The PrincipalSystemRuntime path does not extract thinkingContent
    const assistantAppendCall = stmStore.append.mock.calls[1];
    expect(assistantAppendCall[1].metadata.thinkingContent).toBeUndefined();
  });

  it('does not include metadata on entries when sessionId and scope are omitted', async () => {
    const { runtime, stmStore } = createChatRuntime();

    await runtime.handleChatTurn({
      message: 'Hello without metadata',
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
      // no sessionId or scope
    });

    // User entry should not have metadata (no fields to include)
    const userAppendCall = stmStore.append.mock.calls[0];
    expect(userAppendCall[1].metadata).toBeUndefined();

    // Assistant entry should also not have metadata (contentType is 'text' or undefined, so skipped)
    const assistantAppendCall = stmStore.append.mock.calls[1];
    // May or may not have metadata depending on contentType, but should not have sessionId/scope
    if (assistantAppendCall[1].metadata) {
      expect(assistantAppendCall[1].metadata.sessionId).toBeUndefined();
      expect(assistantAppendCall[1].metadata.scope).toBeUndefined();
    }
  });

  it('accepts scope enum values from ChatTurnInputSchema', async () => {
    const { runtime } = createChatRuntime();

    // These should not throw — the schema accepts these enum values
    for (const scopeValue of ['principal', 'project_thread', 'orphan_thread'] as const) {
      await expect(
        runtime.handleChatTurn({
          message: `Hello with scope ${scopeValue}`,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          sessionId: SESSION_ID,
          scope: scopeValue,
        }),
      ).resolves.toBeDefined();
    }
  });
});
