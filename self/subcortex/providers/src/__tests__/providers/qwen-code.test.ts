import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  type GatewayContextFrame,
  type ModelProviderConfig,
  type ProviderId,
  type ToolDefinition,
  type TraceId,
} from '@nous/shared';
import {
  QWEN_CODE_DEFAULT_MODEL_ID,
  QWEN_CODE_DEFAULT_ENV_ALLOWLIST,
  QWEN_CODE_EXECUTION_CAPABILITY_PROFILE,
  QWEN_CODE_PROVIDER_DEFINITION,
  QwenCodeProvider,
  type QwenCodeCommandResolver,
  type QwenCodeSpawn,
  createQwenCodeAdapter,
  createQwenCodeProcessRunner,
  providerAdapter,
  providerDefinition,
  providerFactory,
  renderQwenCodePrompt,
  resolveQwenCodeExecutable,
  selectQwenCodeExecutable,
} from '../../providers/qwen-code/index.js';
import { createFakeAgentCliRunner } from '../../protocols/agent-cli/index.js';
import { AgentCliProviderMetadataSchema } from '../../schemas/provider-definition.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440188' as TraceId;
const PROVIDER_ID = '10000000-0000-0000-0000-000000000005' as ProviderId;
const CREATED_AT = '2026-06-12T00:00:00.000Z';

interface FakeChildProcess extends ChildProcessWithoutNullStreams {
  readonly killSignals: NodeJS.Signals[];
  readonly stdinInput: string[];
}

function createFakeChildProcess(
  options: {
    readonly closeOnStdinEnd?: boolean;
    readonly closeOnKill?: boolean;
  } = {},
): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  const stdinInput: string[] = [];
  const killSignals: NodeJS.Signals[] = [];
  const closeOnStdinEnd = options.closeOnStdinEnd ?? true;
  const closeOnKill = options.closeOnKill ?? true;

  Object.assign(child, {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new Writable({
      write(chunk, _encoding, callback) {
        stdinInput.push(String(chunk));
        callback();
      },
      final(callback) {
        if (closeOnStdinEnd) {
          queueMicrotask(() => child.emit('close', 0, null));
        }
        callback();
      },
    }),
    kill(signal: NodeJS.Signals = 'SIGTERM') {
      killSignals.push(signal);
      if (closeOnKill) {
        queueMicrotask(() => child.emit('close', null, signal));
      }
      return true;
    },
    killSignals,
    stdinInput,
  });

  return child;
}

function createConfig(modelId = QWEN_CODE_DEFAULT_MODEL_ID): ModelProviderConfig {
  return {
    id: PROVIDER_ID,
    name: 'Qwen Code',
    type: 'text',
    endpoint: 'http://localhost',
    modelId,
    isLocal: true,
    capabilities: ['text'],
    providerClass: 'local_text',
    vendor: 'qwen-code',
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

describe('Qwen Code provider leaf', () => {
  it('declares Agent CLI catalog metadata as a one-shot command provider', () => {
    expect(providerDefinition).toBe(QWEN_CODE_PROVIDER_DEFINITION);
    expect(providerDefinition).toMatchObject({
      vendorKey: 'qwen-code',
      protocol: 'agent-cli',
      adapterKey: 'qwen-code',
      providerClass: 'local_text',
      isLocal: true,
      executionCapabilityProfile: 'one_shot_command',
      capabilities: {
        streaming: true,
      },
    });
    expect(providerDefinition).not.toHaveProperty('wellKnownProviderId');
    expect(AgentCliProviderMetadataSchema.parse(providerDefinition.agentCli))
      .toEqual(providerDefinition.agentCli);
    expect(providerDefinition.agentCli.command.executable).toBe('qwen');
    expect(providerDefinition.agentCli.command.defaultArgs).toEqual([]);
    expect(providerDefinition.agentCli.caveats.join('\n')).toContain(
      'does not auto-approve Qwen Code tool use',
    );
  });

  it('formats canonical gateway input into a Qwen Code prompt string', () => {
    const prompt = renderQwenCodePrompt({
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

  it('exposes a ProviderAdapter module for qwen-code with text-safe parsing', () => {
    const adapter = createQwenCodeAdapter();

    expect(providerAdapter.executionCapabilityProfile).toBe(QWEN_CODE_EXECUTION_CAPABILITY_PROFILE);
    expect(QWEN_CODE_EXECUTION_CAPABILITY_PROFILE).toBe('one_shot_command');
    expect(adapter.capabilities.streaming).toBe(true);
    expect(adapter.formatRequest({
      systemPrompt: 'Act as Qwen.',
      context: [frame('user', 'Implement the task.')],
    })).toEqual({
      input: {
        prompt: 'Act as Qwen.\n\nuser: Implement the task.',
      },
    });
    expect(adapter.parseResponse('done', TRACE_ID)).toMatchObject({
      response: 'done',
      toolCalls: [],
      contentType: 'text',
    });
  });

  it('does not throw and falls back to text for malformed adapter outputs', () => {
    const adapter = createQwenCodeAdapter();
    expect(() => adapter.parseResponse({ unexpected: true }, TRACE_ID)).not.toThrow();
    expect(adapter.parseResponse({ unexpected: true }, TRACE_ID).contentType).toBe('text');
  });

  it('invokes an injected Agent CLI runner and returns stdout as model output', async () => {
    const runner = createFakeAgentCliRunner([
      (invocation) => ({
        exitCode: 0,
        stdout: `qwen saw: ${invocation.command.args?.[1]}`,
        startedAt: 100,
        endedAt: 175,
      }),
    ]);
    const provider = new QwenCodeProvider(createConfig('qwen3-coder-plus'), { runner });

    const response = await provider.invoke({
      role: 'workers',
      input: { prompt: 'Build the provider leaf.' },
      traceId: TRACE_ID,
    });

    expect(response).toEqual({
      output: 'qwen saw: Build the provider leaf.',
      providerId: PROVIDER_ID,
      usage: { computeMs: 75 },
      traceId: TRACE_ID,
    });
    expect(runner.invocations[0]).toMatchObject({
      command: {
        executable: 'qwen',
        env: { NO_COLOR: '1' },
      },
      timeoutMs: 300_000,
      metadata: {
        provider: 'qwen-code',
        providerId: PROVIDER_ID,
        modelId: 'qwen3-coder-plus',
        traceId: TRACE_ID,
      },
    });
    expect(runner.invocations[0]?.command.args).toEqual([
      '-p',
      'Build the provider leaf.',
      '--model',
      'qwen3-coder-plus',
    ]);
    expect(runner.calls[0]?.options?.environmentPolicy).toEqual({
      mergeStrategy: 'allowlist',
      allowlist: QWEN_CODE_DEFAULT_ENV_ALLOWLIST,
    });
  });

  it('uses Qwen Code defaults without passing a synthetic default model', async () => {
    const runner = createFakeAgentCliRunner();
    const provider = new QwenCodeProvider(createConfig(), { runner });

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
      '-p',
      'user: Summarize this.',
    ]);
    expect(runner.invocations[0]?.input).toBeUndefined();
  });

  it('preserves the one-shot qwen path for transient invocations', async () => {
    const runner = createFakeAgentCliRunner([
      { exitCode: 0, stdout: 'first', startedAt: 1, endedAt: 2 },
      { exitCode: 0, stdout: 'second', startedAt: 3, endedAt: 4 },
    ]);
    const provider = new QwenCodeProvider(createConfig(), { runner });

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
    expect(runner.invocations[0]?.command.args).toEqual(['-p', 'first transient task']);
    expect(runner.invocations[1]?.command.args).toEqual(['-p', 'second transient task']);
  });

  it('constructs a provider with the default live runner without invoking it in tests', () => {
    const provider = new QwenCodeProvider(createConfig());

    expect(provider.getConfig().vendor).toBe('qwen-code');
  });

  it('live runner spawns without a shell and uses the default allowlisted environment', async () => {
    const child = createFakeChildProcess();
    let spawnOptions: SpawnOptionsWithoutStdio | undefined;
    const spawnProcess: QwenCodeSpawn = (_command, _args, options) => {
      spawnOptions = options;
      return child;
    };
    const runner = createQwenCodeProcessRunner({
      baseEnv: {
        PATH: 'C:\\tools',
        OPENAI_API_KEY: 'qwen-auth',
        AWS_SECRET_ACCESS_KEY: 'unrelated-secret',
      },
      spawn: spawnProcess,
    });

    const result = await runner.run({
      command: {
        executable: 'C:\\tools\\qwen.cmd',
        args: ['-p', 'hello qwen', '--model', 'qwen3-coder-plus'],
        env: { NO_COLOR: '1' },
      },
      input: 'hello qwen',
      timeoutMs: 1_000,
    });

    expect(result.ok).toBe(true);
    expect(spawnOptions?.shell).toBe(false);
    expect(spawnOptions?.env).toMatchObject({
      PATH: 'C:\\tools',
      OPENAI_API_KEY: 'qwen-auth',
      NO_COLOR: '1',
    });
    expect(spawnOptions?.env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(child.stdinInput.join('')).toBe('hello qwen');
  });

  it('live runner terminates and settles post-start aborts', async () => {
    const child = createFakeChildProcess({ closeOnStdinEnd: false, closeOnKill: false });
    const controller = new AbortController();
    const runner = createQwenCodeProcessRunner({
      killEscalationDelayMs: 1,
      spawn: () => child,
    });

    const resultPromise = runner.run({
      command: {
        executable: 'C:\\tools\\qwen.cmd',
        args: ['-p', 'cancel me'],
      },
      input: 'cancel me',
      timeoutMs: 10_000,
    }, { signal: controller.signal });

    controller.abort();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('spawn_error');
    expect(child.killSignals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('live runner escalates timeout termination and settles if the process ignores SIGTERM', async () => {
    const child = createFakeChildProcess({ closeOnStdinEnd: false, closeOnKill: false });
    const runner = createQwenCodeProcessRunner({
      killEscalationDelayMs: 1,
      spawn: () => child,
    });

    const result = await runner.run({
      command: {
        executable: 'C:\\tools\\qwen.cmd',
        args: ['-p', 'time out'],
      },
      input: 'time out',
      timeoutMs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('timeout');
    expect(result.failure?.timedOut).toBe(true);
    expect(child.killSignals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('selects Qwen Code executable overrides deterministically before PATH lookup', () => {
    expect(selectQwenCodeExecutable({
      explicitExecutable: 'C:\\tools\\qwen-explicit.cmd',
      env: {
        NOUS_QWEN_CODE_BIN: 'C:\\tools\\qwen-nous.cmd',
        QWEN_CODE_BIN: 'C:\\tools\\qwen-generic.cmd',
      },
    })).toBe('C:\\tools\\qwen-explicit.cmd');

    expect(selectQwenCodeExecutable({
      env: {
        NOUS_QWEN_CODE_BIN: 'C:\\tools\\qwen-nous.cmd',
        QWEN_CODE_BIN: 'C:\\tools\\qwen-generic.cmd',
      },
    })).toBe('C:\\tools\\qwen-nous.cmd');

    expect(selectQwenCodeExecutable({
      env: {
        QWEN_CODE_BIN: 'C:\\tools\\qwen-generic.cmd',
      },
    })).toBe('C:\\tools\\qwen-generic.cmd');
  });

  it('prefers a directly-spawnable Windows binary over a .cmd shim', () => {
    const commandResolver: QwenCodeCommandResolver = (command, args) => {
      expect(command).toBe('where.exe');
      expect(args).toEqual(['qwen']);
      return [
        'C:\\Users\\dev\\AppData\\Roaming\\npm\\qwen.cmd',
        'C:\\Program Files\\qwen\\qwen.exe',
      ].join('\r\n');
    };

    expect(resolveQwenCodeExecutable('qwen', {
      commandResolver,
      platform: 'win32',
    })).toBe('C:\\Program Files\\qwen\\qwen.exe');
  });

  it('fails with configuration guidance when only a Windows shim is launchable under shell:false', async () => {
    const commandResolver: QwenCodeCommandResolver = () =>
      'C:\\Users\\dev\\AppData\\Roaming\\npm\\qwen.cmd';
    let spawnCalled = false;
    const runner = createQwenCodeProcessRunner({
      platform: 'win32',
      commandResolver,
      spawn: () => {
        spawnCalled = true;
        return createFakeChildProcess();
      },
    });

    const result = await runner.run({
      command: {
        executable: 'qwen',
        args: ['-p', 'hello qwen'],
      },
      input: 'hello qwen',
      timeoutMs: 1_000,
    });

    expect(spawnCalled).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('spawn_error');
    expect(result.failure?.message).toContain('NOUS_QWEN_CODE_BIN');
    expect(result.failure?.message).toContain('QWEN_CODE_BIN');
  });

  it('resolves default POSIX qwen away from workspace node_modules bin candidates', () => {
    const commandResolver: QwenCodeCommandResolver = (command, args) => {
      expect(command).toBe('which');
      expect(args).toEqual(['-a', 'qwen']);
      return [
        '/repo/node_modules/.bin/qwen',
        '/usr/local/bin/qwen',
      ].join('\n');
    };

    expect(resolveQwenCodeExecutable('qwen', {
      commandResolver,
      platform: 'linux',
    })).toBe('/usr/local/bin/qwen');
  });

  it('maps Agent CLI runner failures to provider errors', async () => {
    const runner = createFakeAgentCliRunner([
      { exitCode: 2, stderr: 'bad args' },
    ]);
    const provider = new QwenCodeProvider(createConfig(), { runner });

    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      context: {
        provider: 'qwen-code',
        failureKind: 'non_zero_exit',
        exitCode: 2,
      },
    });
    expect(runner.invocations).toHaveLength(1);
  });

  it('factory passes runner injection through the provider module contract', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'factory ok' }]);
    const provider = providerFactory.create(createConfig(), {
      agentCliRunner: runner,
    });

    expect(provider).toBeInstanceOf(QwenCodeProvider);
    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    })).resolves.toMatchObject({ output: 'factory ok' });
  });

  it('streams stdout chunks and a terminal done chunk', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'streamed answer' }]);
    const provider = new QwenCodeProvider(createConfig(), { runner });

    const chunks: string[] = [];
    let done = false;
    for await (const chunk of provider.stream({
      role: 'workers',
      input: { prompt: 'stream please' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk.content);
      done = chunk.done;
    }

    expect(chunks.join('')).toContain('streamed answer');
    expect(done).toBe(true);
  });
});
