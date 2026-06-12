import { describe, expect, it } from 'vitest';
import {
  type GatewayContextFrame,
  type ModelProviderConfig,
  NousError,
  type ProviderId,
  type ToolDefinition,
  type TraceId,
} from '@nous/shared';
import {
  CODEX_CLI_AGENT_ADAPTER,
  CODEX_CLI_DEFAULT_MODEL_ID,
  CODEX_CLI_PROVIDER_DEFINITION,
  CodexCliProvider,
  createCodexCliAdapter,
  providerDefinition,
  providerFactory,
  renderCodexCliPrompt,
} from '../../providers/codex-cli/index.js';
import { createFakeAgentCliRunner } from '../../protocols/agent-cli/index.js';
import { AgentCliProviderMetadataSchema } from '../../schemas/provider-definition.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440177' as TraceId;
const PROVIDER_ID = '10000000-0000-0000-0000-000000000004' as ProviderId;
const CREATED_AT = '2026-06-12T00:00:00.000Z';

function createConfig(modelId = CODEX_CLI_DEFAULT_MODEL_ID): ModelProviderConfig {
  return {
    id: PROVIDER_ID,
    name: 'Codex CLI',
    type: 'text',
    endpoint: 'http://localhost',
    modelId,
    isLocal: true,
    capabilities: ['text'],
    providerClass: 'local_text',
    vendor: 'codex-cli',
  };
}

function frame(role: GatewayContextFrame['role'], content: string): GatewayContextFrame {
  return {
    role,
    source: 'initial_context',
    content,
    createdAt: CREATED_AT,
  };
}

function toolDefinition(): ToolDefinition {
  return {
    name: 'lookup',
    version: '1.0.0',
    description: 'Lookup data',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: ['lookup'],
    permissionScope: 'test',
  };
}

describe('Codex CLI provider leaf', () => {
  it('declares Agent CLI catalog metadata without introducing nested taxonomy', () => {
    expect(providerDefinition).toBe(CODEX_CLI_PROVIDER_DEFINITION);
    expect(providerDefinition).toMatchObject({
      vendorKey: 'codex-cli',
      protocol: 'agent-cli',
      adapterKey: 'codex-cli',
      providerClass: 'local_text',
      isLocal: true,
    });
    expect(AgentCliProviderMetadataSchema.parse(providerDefinition.agentCli))
      .toEqual(providerDefinition.agentCli);
    expect(providerDefinition.agentCli.command.defaultArgs).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '--ignore-user-config',
      '--sandbox',
      'read-only',
      '--color',
      'never',
    ]);
  });

  it('formats canonical gateway input into a Codex CLI prompt string', () => {
    const prompt = renderCodexCliPrompt({
      systemPrompt: ['system one', 'system two'],
      context: [
        frame('user', 'hello'),
        frame('assistant', 'hi there'),
      ],
      toolDefinitions: [toolDefinition()],
    });

    expect(prompt).toContain('system one\n\nsystem two');
    expect(prompt).toContain('user: hello');
    expect(prompt).toContain('assistant: hi there');
    expect(prompt).toContain('Available tools:');
    expect(prompt).toContain('"name": "lookup"');
  });

  it('exposes a ProviderAdapter module for codex-cli with text-safe parsing', () => {
    const adapter = createCodexCliAdapter();

    expect(adapter.capabilities.streaming).toBe(false);
    expect(adapter.formatRequest({
      systemPrompt: 'Act as Codex.',
      context: [frame('user', 'Implement the task.')],
    })).toEqual({
      input: {
        prompt: 'Act as Codex.\n\nuser: Implement the task.',
      },
    });
    expect(adapter.parseResponse('done', TRACE_ID)).toMatchObject({
      response: 'done',
      toolCalls: [],
      contentType: 'text',
    });
  });

  it('invokes an injected Agent CLI runner and returns stdout as model output', async () => {
    const runner = createFakeAgentCliRunner([
      (invocation) => ({
        exitCode: 0,
        stdout: `codex saw: ${invocation.input}`,
        startedAt: 100,
        endedAt: 175,
      }),
    ]);
    const provider = new CodexCliProvider(createConfig('gpt-5.5'), { runner });

    const response = await provider.invoke({
      role: 'workers',
      input: { prompt: 'Build the provider leaf.' },
      traceId: TRACE_ID,
    });

    expect(response).toEqual({
      output: 'codex saw: Build the provider leaf.',
      providerId: PROVIDER_ID,
      usage: { computeMs: 75 },
      traceId: TRACE_ID,
    });
    expect(runner.invocations[0]).toMatchObject({
      command: {
        executable: 'codex',
        env: { NO_COLOR: '1' },
      },
      input: 'Build the provider leaf.',
      timeoutMs: 300_000,
      metadata: {
        provider: 'codex-cli',
        providerId: PROVIDER_ID,
        modelId: 'gpt-5.5',
        traceId: TRACE_ID,
      },
    });
    expect(runner.invocations[0]?.command.args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '--ignore-user-config',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--model',
      'gpt-5.5',
      '--output-last-message',
      expect.any(String),
      '-',
    ]);
  });

  it('uses Codex CLI defaults without passing a synthetic default model', async () => {
    const runner = createFakeAgentCliRunner();
    const provider = new CodexCliProvider(createConfig(), { runner });

    await provider.invoke({
      role: 'workers',
      input: {
        messages: [
          { role: 'user', content: 'Summarize this.' },
        ],
      },
      traceId: TRACE_ID,
    });

    expect(runner.invocations[0]?.command.args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '--ignore-user-config',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--output-last-message',
      expect.any(String),
      '-',
    ]);
    expect(runner.invocations[0]?.input).toBe('user: Summarize this.');
  });

  it('constructs a provider with the default live runner without invoking it in tests', () => {
    const provider = new CodexCliProvider(createConfig());

    expect(provider.getConfig().vendor).toBe('codex-cli');
  });

  it('maps Agent CLI runner failures to provider errors', async () => {
    const provider = new CodexCliProvider(createConfig(), {
      runner: createFakeAgentCliRunner([
        { exitCode: 2, stderr: 'bad args' },
      ]),
    });

    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      context: {
        provider: 'codex-cli',
        failureKind: 'non_zero_exit',
        exitCode: 2,
      },
    });
  });

  it('factory passes runner injection through the provider module contract', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'factory ok' }]);
    const provider = providerFactory.create(createConfig(), {
      agentCliRunner: runner,
    });

    expect(provider).toBeInstanceOf(CodexCliProvider);
    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })).resolves.toMatchObject({
      output: 'factory ok',
    });
  });

  it('keeps protocol adapter evidence available for leaf tests', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'ok' }]);
    const result = await CODEX_CLI_AGENT_ADAPTER.invoke({ input: 'hello' }, runner);

    expect(result.invocation.command.executable).toBe('codex');
    expect(result.invocation.command.args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '--ignore-user-config',
      '--sandbox',
      'read-only',
      '--color',
      'never',
    ]);
    expect(result.result.ok).toBe(true);
  });

  it('throws a NousError for unsupported streaming', async () => {
    const provider = new CodexCliProvider(createConfig(), {
      runner: createFakeAgentCliRunner(),
    });

    await expect(async () => {
      for await (const _chunk of provider.stream({
        role: 'workers',
        input: { prompt: 'hello' },
        traceId: TRACE_ID,
      })) {
        // no chunks expected
      }
    }).rejects.toBeInstanceOf(NousError);
  });
});
