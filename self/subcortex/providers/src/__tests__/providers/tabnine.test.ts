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
  TABNINE_DEFAULT_MODEL_ID,
  TABNINE_DEFAULT_ENV_ALLOWLIST,
  TABNINE_EXECUTION_CAPABILITY_PROFILE,
  TABNINE_PROVIDER_DEFINITION,
  TabnineProvider,
  type TabnineCommandResolver,
  type TabnineSpawn,
  createTabnineAdapter,
  createTabnineProcessRunner,
  providerAdapter,
  providerDefinition,
  providerFactory,
  renderTabninePrompt,
  resolveTabnineExecutable,
  selectTabnineExecutable,
} from '../../providers/tabnine/index.js';
import { createFakeAgentCliRunner } from '../../protocols/agent-cli/index.js';
import { AgentCliProviderMetadataSchema } from '../../schemas/provider-definition.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440300' as TraceId;
const PROVIDER_ID = '10000000-0000-0000-0000-000000000030' as ProviderId;
const CREATED_AT = '2026-07-27T00:00:00.000Z';

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

function createConfig(modelId = TABNINE_DEFAULT_MODEL_ID): ModelProviderConfig {
  return {
    id: PROVIDER_ID,
    name: 'Tabnine',
    type: 'text',
    endpoint: 'http://localhost',
    modelId,
    isLocal: true,
    capabilities: ['text'],
    providerClass: 'local_text',
    vendor: 'tabnine',
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

describe('Tabnine provider leaf', () => {
  it('declares Agent CLI catalog metadata as a one-shot command provider', () => {
    expect(providerDefinition).toBe(TABNINE_PROVIDER_DEFINITION);
    expect(providerDefinition).toMatchObject({
      vendorKey: 'tabnine',
      protocol: 'agent-cli',
      adapterKey: 'tabnine',
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
    expect(providerDefinition.agentCli.command.executable).toBe('tabnine');
    expect(providerDefinition.agentCli.command.defaultArgs).toEqual([]);
    expect(providerDefinition.agentCli.headless.requiredArgs).toEqual([]);
    expect(providerDefinition.agentCli.targetIssueRefs).toContain('#300');
  });

  it('declares TABNINE_TOKEN as the headless credential and stays auth-optional', () => {
    expect(providerDefinition.auth).toEqual({ required: false, purpose: 'api_key' });
    expect(providerDefinition.agentCli.auth).toMatchObject({
      kind: 'api_key',
      envVar: 'TABNINE_TOKEN',
    });
    // Model selection is not a CLI flag; the caveats document the settings.json path.
    expect(providerDefinition.agentCli.caveats.join('\n')).toContain(
      'settings.json',
    );
  });

  it('formats canonical gateway input into a Tabnine prompt string', () => {
    const prompt = renderTabninePrompt({
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

  it('exposes a ProviderAdapter module for tabnine with text-safe parsing', () => {
    const adapter = createTabnineAdapter();

    expect(providerAdapter.executionCapabilityProfile).toBe(TABNINE_EXECUTION_CAPABILITY_PROFILE);
    expect(TABNINE_EXECUTION_CAPABILITY_PROFILE).toBe('one_shot_command');
    expect(adapter.capabilities.streaming).toBe(true);
    expect(adapter.capabilities.nativeToolUse).toBe(false);
    expect(adapter.formatRequest({
      systemPrompt: 'Act as Tabnine.',
      context: [frame('user', 'Implement the task.')],
    })).toEqual({
      input: {
        prompt: 'Act as Tabnine.\n\nuser: Implement the task.',
      },
    });
    expect(adapter.parseResponse('done', TRACE_ID)).toMatchObject({
      response: 'done',
      toolCalls: [],
      contentType: 'text',
    });
  });

  it('does not throw and falls back to text for malformed adapter outputs', () => {
    const adapter = createTabnineAdapter();
    expect(() => adapter.parseResponse({ unexpected: true }, TRACE_ID)).not.toThrow();
    expect(adapter.parseResponse({ unexpected: true }, TRACE_ID).contentType).toBe('text');
  });

  it('invokes an injected Agent CLI runner and returns stdout as model output', async () => {
    const runner = createFakeAgentCliRunner([
      (invocation) => ({
        exitCode: 0,
        stdout: `tabnine saw: ${invocation.command.args?.[1]}`,
        startedAt: 100,
        endedAt: 180,
      }),
    ]);
    const provider = new TabnineProvider(createConfig(), { runner });

    const response = await provider.invoke({
      role: 'workers',
      input: { prompt: 'Build the provider leaf.' },
      traceId: TRACE_ID,
    });

    expect(response).toEqual({
      output: 'tabnine saw: Build the provider leaf.',
      providerId: PROVIDER_ID,
      usage: { computeMs: 80 },
      traceId: TRACE_ID,
    });
    expect(runner.invocations[0]).toMatchObject({
      command: {
        executable: 'tabnine',
        env: { NO_COLOR: '1' },
      },
      timeoutMs: 300_000,
      metadata: {
        provider: 'tabnine',
        providerId: PROVIDER_ID,
        modelId: TABNINE_DEFAULT_MODEL_ID,
        traceId: TRACE_ID,
      },
    });
    expect(runner.invocations[0]?.command.args).toEqual([
      '-p',
      'Build the provider leaf.',
    ]);
    expect(runner.invocations[0]?.command.args).not.toContain('-y');
    expect(runner.calls[0]?.options?.environmentPolicy).toEqual({
      mergeStrategy: 'allowlist',
      allowlist: TABNINE_DEFAULT_ENV_ALLOWLIST,
    });
  });

  it('never passes a model flag even when a concrete modelId is configured', async () => {
    const runner = createFakeAgentCliRunner();
    const provider = new TabnineProvider(createConfig('tabnine/protected-model'), { runner });

    await provider.invoke({
      role: 'workers',
      input: {
        messages: [
          { role: 'user', content: 'Summarize this.' },
        ],
      },
      traceId: TRACE_ID,
    });

    // Tabnine reads the model from ~/.tabnine/agent/settings.json, so the CLI
    // invocation must remain `tabnine -p "<prompt>"` with no --model argument.
    expect(runner.invocations[0]?.command.args).toEqual([
      '-p',
      'user: Summarize this.',
    ]);
    expect(runner.invocations[0]?.command.args).not.toContain('--model');
    expect(runner.invocations[0]?.input).toBeUndefined();
  });

  it('preserves the one-shot tabnine path for transient invocations', async () => {
    const runner = createFakeAgentCliRunner([
      { exitCode: 0, stdout: 'first', startedAt: 1, endedAt: 2 },
      { exitCode: 0, stdout: 'second', startedAt: 3, endedAt: 4 },
    ]);
    const provider = new TabnineProvider(createConfig(), { runner });

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
    const provider = new TabnineProvider(createConfig());

    expect(provider.getConfig().vendor).toBe('tabnine');
  });

  it('live runner spawns without a shell and uses the default allowlisted environment', async () => {
    const child = createFakeChildProcess();
    let spawnOptions: SpawnOptionsWithoutStdio | undefined;
    const spawnProcess: TabnineSpawn = (_command, _args, options) => {
      spawnOptions = options;
      return child;
    };
    const runner = createTabnineProcessRunner({
      baseEnv: {
        PATH: '/usr/local/bin',
        TABNINE_TOKEN: 'tabnine-pat',
        TABNINE_HOST: 'https://console.tabnine.com',
        AWS_SECRET_ACCESS_KEY: 'unrelated-secret',
      },
      spawn: spawnProcess,
    });

    const result = await runner.run({
      command: {
        executable: '/usr/local/bin/tabnine',
        args: ['-p', 'hello tabnine'],
        env: { NO_COLOR: '1' },
      },
      input: 'hello tabnine',
      timeoutMs: 1_000,
    });

    expect(result.ok).toBe(true);
    expect(spawnOptions?.shell).toBe(false);
    expect(spawnOptions?.env).toMatchObject({
      PATH: '/usr/local/bin',
      TABNINE_TOKEN: 'tabnine-pat',
      TABNINE_HOST: 'https://console.tabnine.com',
      NO_COLOR: '1',
    });
    expect(spawnOptions?.env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(child.stdinInput.join('')).toBe('hello tabnine');
  });

  it('live runner terminates and settles post-start aborts', async () => {
    const child = createFakeChildProcess({ closeOnStdinEnd: false, closeOnKill: false });
    const controller = new AbortController();
    const runner = createTabnineProcessRunner({
      killEscalationDelayMs: 1,
      spawn: () => child,
    });

    const resultPromise = runner.run({
      command: {
        executable: '/usr/local/bin/tabnine',
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
    const runner = createTabnineProcessRunner({
      killEscalationDelayMs: 1,
      spawn: () => child,
    });

    const result = await runner.run({
      command: {
        executable: '/usr/local/bin/tabnine',
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

  it('selects Tabnine executable overrides deterministically before PATH lookup', () => {
    expect(selectTabnineExecutable({
      explicitExecutable: '/opt/tabnine-explicit',
      env: {
        NOUS_TABNINE_BIN: '/opt/tabnine-nous',
        TABNINE_BIN: '/opt/tabnine-generic',
      },
    })).toBe('/opt/tabnine-explicit');

    expect(selectTabnineExecutable({
      env: {
        NOUS_TABNINE_BIN: '/opt/tabnine-nous',
        TABNINE_BIN: '/opt/tabnine-generic',
      },
    })).toBe('/opt/tabnine-nous');

    expect(selectTabnineExecutable({
      env: {
        TABNINE_BIN: '/opt/tabnine-generic',
      },
    })).toBe('/opt/tabnine-generic');
  });

  it('prefers a directly-spawnable Windows binary over a .cmd shim', () => {
    const commandResolver: TabnineCommandResolver = (command, args) => {
      expect(command).toBe('where.exe');
      expect(args).toEqual(['tabnine']);
      return [
        'C:\\Users\\dev\\AppData\\Roaming\\npm\\tabnine.cmd',
        'C:\\Program Files\\tabnine\\tabnine.exe',
      ].join('\r\n');
    };

    expect(resolveTabnineExecutable('tabnine', {
      commandResolver,
      platform: 'win32',
    })).toBe('C:\\Program Files\\tabnine\\tabnine.exe');
  });

  it('fails with configuration guidance when only a Windows shim is launchable under shell:false', async () => {
    const commandResolver: TabnineCommandResolver = () =>
      'C:\\Users\\dev\\AppData\\Roaming\\npm\\tabnine.cmd';
    let spawnCalled = false;
    const runner = createTabnineProcessRunner({
      platform: 'win32',
      commandResolver,
      spawn: () => {
        spawnCalled = true;
        return createFakeChildProcess();
      },
    });

    const result = await runner.run({
      command: {
        executable: 'tabnine',
        args: ['-p', 'hello tabnine'],
      },
      input: 'hello tabnine',
      timeoutMs: 1_000,
    });

    expect(spawnCalled).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('spawn_error');
    expect(result.failure?.message).toContain('NOUS_TABNINE_BIN');
    expect(result.failure?.message).toContain('TABNINE_BIN');
  });

  it('resolves default POSIX tabnine away from workspace node_modules bin candidates', () => {
    const commandResolver: TabnineCommandResolver = (command, args) => {
      expect(command).toBe('which');
      expect(args).toEqual(['-a', 'tabnine']);
      return [
        '/repo/node_modules/.bin/tabnine',
        '/usr/local/bin/tabnine',
      ].join('\n');
    };

    expect(resolveTabnineExecutable('tabnine', {
      commandResolver,
      platform: 'linux',
    })).toBe('/usr/local/bin/tabnine');
  });

  it('rejects invalid provider input before invoking the runner', async () => {
    const runner = createFakeAgentCliRunner();
    const provider = new TabnineProvider(createConfig(), { runner });

    await expect(provider.invoke({
      role: 'workers',
      input: { unexpected: 'shape' } as never,
      traceId: TRACE_ID,
    })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(runner.invocations).toHaveLength(0);
  });

  it('maps Agent CLI runner failures to provider errors', async () => {
    const runner = createFakeAgentCliRunner([
      { exitCode: 2, stderr: 'bad args' },
    ]);
    const provider = new TabnineProvider(createConfig(), { runner });

    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hello' },
      traceId: TRACE_ID,
    })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      context: {
        provider: 'tabnine',
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

    expect(provider).toBeInstanceOf(TabnineProvider);
    await expect(provider.invoke({
      role: 'workers',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    })).resolves.toMatchObject({ output: 'factory ok' });
  });

  it('streams stdout chunks and a terminal done chunk', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'streamed answer' }]);
    const provider = new TabnineProvider(createConfig(), { runner });

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
