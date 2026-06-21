import { describe, expect, it } from 'vitest';
import {
  type GatewayContextFrame,
  type ModelProviderConfig,
  type ProviderId,
  type ToolDefinition,
  type TraceId,
} from '@nous/shared';
import {
  CODEX_CLI_AGENT_ADAPTER,
  CODEX_CLI_DEFAULT_MODEL_ID,
  CODEX_CLI_EXECUTION_CAPABILITY_PROFILE,
  CODEX_CLI_PROVIDER_DEFINITION,
  CodexCliProvider,
  type CodexCliCommandResolver,
  createCodexCliAdapter,
  providerAdapter,
  providerDefinition,
  providerFactory,
  renderCodexCliPrompt,
  resolveCodexCliExecutable,
  selectCodexCliExecutable,
} from '../../providers/codex-cli/index.js';
import { createFakeAgentCliRunner, normalizeAgentCliRunResult } from '../../protocols/agent-cli/index.js';
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
      capabilities: {
        streaming: true,
      },
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

    expect(providerAdapter.executionCapabilityProfile).toBe(CODEX_CLI_EXECUTION_CAPABILITY_PROFILE);
    expect(CODEX_CLI_EXECUTION_CAPABILITY_PROFILE).toBe('session_bound_command');
    expect(adapter.capabilities.streaming).toBe(true);
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

  it('preserves the one-shot codex exec path for transient invocations', async () => {
    const runner = createFakeAgentCliRunner([
      { exitCode: 0, stdout: 'first', startedAt: 1, endedAt: 2 },
      { exitCode: 0, stdout: 'second', startedAt: 3, endedAt: 4 },
    ]);
    const provider = new CodexCliProvider(createConfig(), { runner });

    await provider.invoke({
      role: 'workers',
      input: { prompt: 'first transient task' },
      traceId: TRACE_ID,
    });
    await provider.invoke({
      role: 'workers',
      input: { prompt: 'second transient task' },
      traceId: TRACE_ID,
    });

    expect(runner.invocations).toHaveLength(2);
    expect(runner.invocations.map((call) => call.command.args?.slice(0, 7))).toEqual([
      ['--ask-for-approval', 'never', 'exec', '--ignore-user-config', '--sandbox', 'read-only', '--color'],
      ['--ask-for-approval', 'never', 'exec', '--ignore-user-config', '--sandbox', 'read-only', '--color'],
    ]);
    expect(runner.invocations[0]?.input).toBe('first transient task');
    expect(runner.invocations[1]?.input).toBe('second transient task');
  });

  it('constructs a provider with the default live runner without invoking it in tests', () => {
    const provider = new CodexCliProvider(createConfig());

    expect(provider.getConfig().vendor).toBe('codex-cli');
  });

  it('selects Codex executable overrides deterministically before PATH lookup', () => {
    expect(selectCodexCliExecutable({
      explicitExecutable: 'C:\\tools\\codex-explicit.cmd',
      env: {
        NOUS_CODEX_CLI_BIN: 'C:\\tools\\codex-nous.cmd',
        CODEX_CLI_BIN: 'C:\\tools\\codex-generic.cmd',
      },
    })).toBe('C:\\tools\\codex-explicit.cmd');

    expect(selectCodexCliExecutable({
      env: {
        NOUS_CODEX_CLI_BIN: 'C:\\tools\\codex-nous.cmd',
        CODEX_CLI_BIN: 'C:\\tools\\codex-generic.cmd',
      },
    })).toBe('C:\\tools\\codex-nous.cmd');

    expect(selectCodexCliExecutable({
      env: {
        CODEX_CLI_BIN: 'C:\\tools\\codex-generic.cmd',
      },
    })).toBe('C:\\tools\\codex-generic.cmd');
  });

  it('resolves default Windows codex away from workspace node_modules bin candidates', () => {
    const commandResolver: CodexCliCommandResolver = (command, args) => {
      expect(command).toBe('where.exe');
      expect(args).toEqual(['codex']);
      return [
        'S:\\Localhost\\Nous\\nous-core\\node_modules\\.bin\\codex.CMD',
        'C:\\nvm4w\\nodejs\\codex.ps1',
        'C:\\nvm4w\\nodejs\\codex.cmd',
      ].join('\r\n');
    };

    expect(resolveCodexCliExecutable('codex', {
      commandResolver,
      platform: 'win32',
    })).toBe('C:\\nvm4w\\nodejs\\codex.cmd');
  });

  it('resolves default POSIX codex away from workspace node_modules bin candidates', () => {
    const commandResolver: CodexCliCommandResolver = (command, args) => {
      expect(command).toBe('which');
      expect(args).toEqual(['-a', 'codex']);
      return [
        '/repo/node_modules/.bin/codex',
        '/usr/local/bin/codex',
      ].join('\n');
    };

    expect(resolveCodexCliExecutable('codex', {
      commandResolver,
      platform: 'linux',
    })).toBe('/usr/local/bin/codex');
  });

  it('falls back to bare codex when lookup only finds workspace bin candidates', () => {
    const commandResolver: CodexCliCommandResolver = () => [
      'S:\\Localhost\\Nous\\nous-core\\node_modules\\.bin\\codex.CMD',
      'S:\\Localhost\\Nous\\nous-core\\node_modules\\.bin\\codex.ps1',
    ].join('\r\n');

    expect(resolveCodexCliExecutable('codex', {
      commandResolver,
      platform: 'win32',
    })).toBe('codex');
  });

  it('maps Agent CLI runner failures to provider errors', async () => {
    const runner = createFakeAgentCliRunner([
      { exitCode: 2, stderr: 'bad args' },
    ]);
    const provider = new CodexCliProvider(createConfig(), {
      runner,
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
    expect(runner.invocations).toHaveLength(1);
  });

  it('retries without --ignore-user-config and with service_tier=fast when the selected Codex CLI rejects the flag', async () => {
    const runner = createFakeAgentCliRunner([
      {
        exitCode: 2,
        stderr: "error: unexpected argument '--ignore-user-config' found",
      },
      {
        exitCode: 0,
        stdout: 'fallback ok',
      },
    ]);
    const provider = new CodexCliProvider(createConfig('gpt-5.5'), { runner });

    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })).resolves.toMatchObject({
      output: 'fallback ok',
    });

    expect(runner.invocations).toHaveLength(2);
    expect(runner.invocations[0]?.command.args).toContain('--ignore-user-config');
    expect(runner.invocations[1]?.command.args).not.toContain('--ignore-user-config');
    expect(runner.invocations[1]?.command.args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '-c',
      'service_tier=fast',
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

  it('surfaces an actionable service_tier config error when compatibility retry cannot override it', async () => {
    const runner = createFakeAgentCliRunner([
      {
        exitCode: 2,
        stderr: "error: unexpected argument '--ignore-user-config' found",
      },
      {
        exitCode: 2,
        stderr: 'Error loading config.toml: unknown variant default, expected fast or flex in service_tier',
      },
    ]);
    const provider = new CodexCliProvider(createConfig('gpt-5.5'), { runner });

    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message: expect.stringContaining('service_tier = "default"'),
      context: {
        provider: 'codex-cli',
        failureKind: 'non_zero_exit',
        exitCode: 2,
      },
    });

    expect(runner.invocations).toHaveLength(2);
    expect(runner.invocations[1]?.command.args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '-c',
      'service_tier=fast',
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

  it('streams Codex CLI JSONL assistant message snapshots into content chunks', async () => {
    const finalResult = normalizeAgentCliRunResult({
      exitCode: 0,
      stdout: [
        '{"type":"item.updated","item":{"id":"msg-1","type":"assistant_message","text":"Hel"}}',
        '{"type":"item.updated","item":{"id":"msg-1","type":"assistant_message","text":"Hello"}}',
        '{"type":"turn.completed","usage":{"input_tokens":4,"output_tokens":2}}',
      ].join('\n'),
    });
    const runner = createFakeAgentCliRunner([], [[
      {
        stream: 'stdout',
        text: [
          '{"type":"session.created","session_id":"test"}',
          '{"type":"item.updated","item":{"id":"msg-1","type":"reasoning","text":"private"}}',
          '{"type":"item.updated","item":{"id":"msg-1","type":"assistant_message","text":"Hel"}}',
        ].join('\n') + '\n',
      },
      {
        stream: 'stdout',
        text: [
          '{"type":"item.updated","item":{"id":"msg-1","type":"assistant_message","text":"Hello"}}',
          '{"type":"turn.completed","usage":{"input_tokens":4,"output_tokens":2}}',
        ].join('\n') + '\n',
      },
      { stream: 'system', result: finalResult },
    ]]);
    const provider = new CodexCliProvider(createConfig(), {
      runner,
    });

    const chunks = [];
    for await (const chunk of provider.stream({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: 'Hel', done: false },
      { content: 'lo', done: false },
      { content: '', done: true, usage: { inputTokens: 4, outputTokens: 2 } },
    ]);
    expect(runner.streamInvocations[0]?.command.args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '--ignore-user-config',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--json',
      '--output-last-message',
      expect.any(String),
      '-',
    ]);
  });

  it('retries streaming without --ignore-user-config when the selected Codex CLI rejects the flag', async () => {
    const runner = createFakeAgentCliRunner([], [
      [
        {
          stream: 'system',
          result: normalizeAgentCliRunResult({
            exitCode: 2,
            stderr: "error: unexpected argument '--ignore-user-config' found",
          }),
        },
      ],
      [
        { stream: 'stdout', text: '{"type":"message.delta","role":"assistant","delta":"fallback ok"}\n' },
        {
          stream: 'system',
          result: normalizeAgentCliRunResult({
            exitCode: 0,
            stdout: '{"type":"message.delta","role":"assistant","delta":"fallback ok"}\n',
          }),
        },
      ],
    ]);
    const provider = new CodexCliProvider(createConfig('gpt-5.5'), { runner });

    const chunks = [];
    for await (const chunk of provider.stream({
        role: 'workers',
        input: { prompt: 'hello' },
        traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: 'fallback ok', done: false },
      { content: '', done: true },
    ]);
    expect(runner.streamInvocations).toHaveLength(2);
    expect(runner.streamInvocations[0]?.command.args).toContain('--ignore-user-config');
    expect(runner.streamInvocations[1]?.command.args).not.toContain('--ignore-user-config');
    expect(runner.streamInvocations[1]?.command.args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '-c',
      'service_tier=fast',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--json',
      '--model',
      'gpt-5.5',
      '--output-last-message',
      expect.any(String),
      '-',
    ]);
  });

  it('ignores non-assistant Codex CLI message-shaped JSONL events', async () => {
    const runner = createFakeAgentCliRunner([], [[
      {
        stream: 'stdout',
        text: [
          '{"type":"item.updated","item":{"id":"user-1","type":"user_message","text":"user text"}}',
          '{"type":"item.updated","item":{"id":"system-1","type":"system_message","text":"system text"}}',
          '{"type":"item.updated","item":{"id":"tool-1","type":"tool_message","text":"tool text"}}',
          '{"type":"message","role":"user","content":"top-level user text"}',
          '{"type":"message.delta","delta":"ambiguous delta without role"}',
          '{"type":"message","message":{"id":"msg-1","role":"system","content":"nested system text"}}',
          '{"type":"message","message":{"id":"msg-2","role":"tool","content":"nested tool text"}}',
        ].join('\n') + '\n',
      },
      {
        stream: 'system',
        result: normalizeAgentCliRunResult({
          exitCode: 0,
          stdout: '',
        }),
      },
    ]]);
    const provider = new CodexCliProvider(createConfig(), {
      runner,
    });

    const chunks = [];
    for await (const chunk of provider.stream({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: '', done: true },
    ]);
  });

  it('accepts generic Codex CLI message events only with assistant role', async () => {
    const runner = createFakeAgentCliRunner([], [[
      {
        stream: 'stdout',
        text: [
          '{"type":"message","role":"assistant","content":"top-level assistant"}',
          '{"type":"message.delta","role":"assistant","delta":" delta"}',
          '{"type":"message","message":{"id":"msg-1","role":"assistant","content":" nested assistant"}}',
        ].join('\n') + '\n',
      },
      {
        stream: 'system',
        result: normalizeAgentCliRunResult({
          exitCode: 0,
          stdout: '',
        }),
      },
    ]]);
    const provider = new CodexCliProvider(createConfig(), {
      runner,
    });

    const chunks = [];
    for await (const chunk of provider.stream({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: 'top-level assistant', done: false },
      { content: ' delta', done: false },
      { content: ' nested assistant', done: false },
      { content: '', done: true },
    ]);
  });
});
