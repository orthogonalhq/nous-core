import { describe, expect, it } from 'vitest';
import {
  NousError,
  type GatewayContextFrame,
  type ModelProviderConfig,
  type ModelStreamChunk,
  type ProviderId,
  type ToolDefinition,
  type TraceId,
} from '@nous/shared';
import {
  OPENCLAW_AGENT_ADAPTER,
  OPENCLAW_DEFAULT_MODEL_ID,
  OPENCLAW_EXECUTION_CAPABILITY_PROFILE,
  OPENCLAW_PROVIDER_DEFINITION,
  OpenClawProvider,
  createOpenClawAdapter,
  providerAdapter,
  providerDefinition,
  providerFactory,
  renderOpenClawPrompt,
  selectOpenClawExecutable,
} from '../../providers/openclaw/index.js';
import { createFakeAgentCliRunner } from '../../protocols/agent-cli/index.js';
import { AgentCliProviderMetadataSchema } from '../../schemas/provider-definition.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440177' as TraceId;
const PROVIDER_ID = '20000000-0000-0000-0000-0000000000c1' as ProviderId;
const CREATED_AT = '2026-06-21T00:00:00.000Z';

function createConfig(modelId = OPENCLAW_DEFAULT_MODEL_ID): ModelProviderConfig {
  return {
    id: PROVIDER_ID,
    name: 'OpenClaw',
    type: 'text',
    endpoint: 'http://localhost',
    modelId,
    isLocal: true,
    capabilities: ['text'],
    providerClass: 'local_text',
    vendor: 'openclaw',
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

async function collectStream(
  stream: AsyncIterable<ModelStreamChunk>,
): Promise<ModelStreamChunk[]> {
  const chunks: ModelStreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('OpenClaw provider leaf', () => {
  it('declares Agent CLI catalog metadata without introducing nested taxonomy', () => {
    expect(providerDefinition).toBe(OPENCLAW_PROVIDER_DEFINITION);
    expect(providerDefinition).toMatchObject({
      vendorKey: 'openclaw',
      protocol: 'agent-cli',
      adapterKey: 'openclaw',
      providerClass: 'local_text',
      isLocal: true,
      executionCapabilityProfile: 'session_bound_command',
      capabilities: {
        streaming: true,
      },
    });
    expect(AgentCliProviderMetadataSchema.parse(providerDefinition.agentCli))
      .toEqual(providerDefinition.agentCli);
    expect(providerDefinition.agentCli.command.defaultArgs).toEqual([
      'run',
      '--headless',
      '--no-color',
    ]);
    expect(providerFactory.vendorKey).toBe('openclaw');
  });

  it('formats canonical gateway input into an OpenClaw prompt string', () => {
    const prompt = renderOpenClawPrompt({
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

  it('exposes a ProviderAdapter module for openclaw with text-safe parsing', () => {
    const adapter = createOpenClawAdapter();

    expect(providerAdapter.executionCapabilityProfile).toBe(OPENCLAW_EXECUTION_CAPABILITY_PROFILE);
    expect(OPENCLAW_EXECUTION_CAPABILITY_PROFILE).toBe('session_bound_command');
    expect(adapter.capabilities.streaming).toBe(true);
    expect(adapter.formatRequest({
      systemPrompt: 'Act as OpenClaw.',
      context: [frame('user', 'Implement the task.')],
    })).toEqual({
      input: {
        prompt: 'Act as OpenClaw.\n\nuser: Implement the task.',
      },
    });
    // Non-JSON output falls back to a plain text response instead of throwing.
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
        stdout: `openclaw saw: ${invocation.input}\n`,
        startedAt: 100,
        endedAt: 180,
      }),
    ]);
    const provider = new OpenClawProvider(createConfig('claw-pro'), { runner });

    const response = await provider.invoke({
      role: 'workers',
      input: { prompt: 'Build the provider leaf.' },
      traceId: TRACE_ID,
    });

    expect(response).toEqual({
      output: 'openclaw saw: Build the provider leaf.',
      providerId: PROVIDER_ID,
      usage: { computeMs: 80 },
      traceId: TRACE_ID,
    });
    expect(runner.invocations[0]).toMatchObject({
      command: {
        executable: 'openclaw',
        env: { NO_COLOR: '1' },
      },
      input: 'Build the provider leaf.',
      timeoutMs: 300_000,
      metadata: {
        provider: 'openclaw',
        providerId: PROVIDER_ID,
        modelId: 'claw-pro',
        traceId: TRACE_ID,
      },
    });
    expect(runner.invocations[0]?.command.args).toEqual([
      'run',
      '--headless',
      '--no-color',
      '--model',
      'claw-pro',
    ]);
  });

  it('uses OpenClaw defaults without passing a synthetic default model', async () => {
    const runner = createFakeAgentCliRunner();
    const provider = new OpenClawProvider(createConfig(), { runner });

    await provider.invoke({
      role: 'workers',
      input: {
        messages: [{ role: 'user', content: 'Summarize this.' }],
      },
      traceId: TRACE_ID,
    });

    expect(runner.invocations[0]?.command.args).toEqual([
      'run',
      '--headless',
      '--no-color',
    ]);
    expect(runner.invocations[0]?.input).toBe('user: Summarize this.');
  });

  it('maps a non-zero CLI exit into a typed provider error', async () => {
    const runner = createFakeAgentCliRunner([
      { exitCode: 1, stderr: 'openclaw: model not found', startedAt: 1, endedAt: 2 },
    ]);
    const provider = new OpenClawProvider(createConfig('missing'), { runner });

    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    })).rejects.toBeInstanceOf(NousError);
  });

  it('streams stdout transcript chunks followed by a terminal done chunk', async () => {
    const runner = createFakeAgentCliRunner(
      [],
      [
        [
          { stream: 'stdout', text: 'Hello ' },
          { stream: 'stdout', text: 'world' },
          { stream: 'system', result: { ok: true, stdout: 'Hello world', stderr: '', transcript: { entries: [], stdout: 'Hello world', stderr: '' } } },
        ],
      ],
    );
    const provider = new OpenClawProvider(createConfig(), { runner });

    const chunks = await collectStream(provider.stream({
      role: 'workers',
      input: { prompt: 'greet' },
      traceId: TRACE_ID,
    }));

    expect(chunks.filter((chunk) => !chunk.done).map((chunk) => chunk.content)).toEqual([
      'Hello ',
      'world',
    ]);
    expect(chunks.at(-1)).toEqual({ content: '', done: true });
  });

  it('selects the OpenClaw executable override deterministically before PATH lookup', () => {
    expect(selectOpenClawExecutable({
      explicitExecutable: '/tools/openclaw-explicit',
      env: {
        NOUS_OPENCLAW_CLI_BIN: '/tools/openclaw-nous',
        OPENCLAW_CLI_BIN: '/tools/openclaw-generic',
      },
    })).toBe('/tools/openclaw-explicit');

    expect(selectOpenClawExecutable({
      env: {
        NOUS_OPENCLAW_CLI_BIN: '/tools/openclaw-nous',
        OPENCLAW_CLI_BIN: '/tools/openclaw-generic',
      },
    })).toBe('/tools/openclaw-nous');

    expect(selectOpenClawExecutable({
      env: { OPENCLAW_CLI_BIN: '/tools/openclaw-generic' },
    })).toBe('/tools/openclaw-generic');

    expect(selectOpenClawExecutable({ env: {} })).toBe('openclaw');
  });

  it('constructs a provider with the default live runner without invoking it in tests', () => {
    const provider = new OpenClawProvider(createConfig());

    expect(provider.getConfig().vendor).toBe('openclaw');
    expect(OPENCLAW_AGENT_ADAPTER.metadata.protocolId).toBe('agent-cli');
  });
});
