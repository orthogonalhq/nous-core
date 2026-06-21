import { describe, expect, it } from 'vitest';
import {
  AGENT_CLI_RUNNER_POLICY,
  AGENT_CLI_PROTOCOL_ID,
  AgentCliProviderMetadataSchema,
  ProviderDefinitionSchema,
  createFakeAgentCliRunner,
  createAgentCliProviderAdapter,
  createAgentCliInvocation,
  normalizeAgentCliRunResult,
  type AgentCliRunnerOptions,
} from '../../index.js';

describe('Agent CLI protocol foundation', () => {
  it('normalizes successful command output with transcript capture', () => {
    const result = normalizeAgentCliRunResult({
      exitCode: 0,
      stdout: 'assistant response',
      stderr: 'diagnostic detail',
      startedAt: 100,
      endedAt: 135,
    });

    expect(result).toMatchObject({
      ok: true,
      exitCode: 0,
      stdout: 'assistant response',
      stderr: 'diagnostic detail',
      durationMs: 35,
    });
    expect(result.failure).toBeUndefined();
    expect(result.transcript.entries).toEqual([
      { stream: 'stdout', text: 'assistant response' },
      { stream: 'stderr', text: 'diagnostic detail' },
    ]);
  });

  it('maps timeouts, spawn errors, and non-zero exits to stable failure kinds', () => {
    expect(normalizeAgentCliRunResult({ timedOut: true }).failure?.kind).toBe('timeout');
    expect(normalizeAgentCliRunResult({ error: new Error('missing executable') }).failure)
      .toMatchObject({ kind: 'spawn_error', message: 'missing executable' });
    expect(normalizeAgentCliRunResult({ exitCode: 2 }).failure)
      .toMatchObject({ kind: 'non_zero_exit', exitCode: 2 });
  });

  it('builds deterministic invocations from provider metadata and per-call options', () => {
    const invocation = createAgentCliInvocation({
      command: {
        executable: 'fake-agent',
        defaultArgs: ['--headless', '--json'],
        env: { AGENT_HOME: '.agent' },
      },
      headless: {
        supported: true,
        requiredArgs: ['--headless', '--no-color'],
        nonInteractiveEnv: { NO_COLOR: '1' },
      },
      timeout: {
        defaultMs: 30_000,
        maxMs: 60_000,
      },
    }, {
      args: ['--model', 'test-model'],
      cwd: 'S:/repo',
      env: { AGENT_HOME: '.agent-test', CI: '1' },
      input: 'hello',
      timeoutMs: 90_000,
      metadata: { providerId: 'fake-agent-cli' },
    });

    expect(invocation).toEqual({
      command: {
        executable: 'fake-agent',
        args: ['--headless', '--json', '--headless', '--no-color', '--model', 'test-model'],
        cwd: 'S:/repo',
        env: {
          AGENT_HOME: '.agent-test',
          NO_COLOR: '1',
          CI: '1',
        },
      },
      input: 'hello',
      timeoutMs: 60_000,
      metadata: { providerId: 'fake-agent-cli' },
    });
  });

  it('provides a fake runner shape for provider leaf tests without live CLI execution', async () => {
    const runner = createFakeAgentCliRunner([
      (invocation) => ({
        exitCode: 0,
        stdout: `ran ${invocation.command.executable} ${invocation.command.args?.join(' ') ?? ''}`.trim(),
      }),
    ]);

    const result = await runner.run({
      command: {
        executable: 'fake-agent',
        args: ['--headless', '--json'],
      },
      input: 'hello',
      timeoutMs: 1_000,
    });

    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('ran fake-agent --headless --json');
    expect(runner.policy).toBe(AGENT_CLI_RUNNER_POLICY);
    expect(runner.policy).toMatchObject({
      liveProcessRunnerIncluded: false,
      runnerInjectionRequired: true,
    });
    expect(runner.invocations).toHaveLength(1);
    expect(runner.invocations[0]?.input).toBe('hello');
  });

  it('creates provider adapters that invoke injected runners and return invocation evidence', async () => {
    const adapter = createAgentCliProviderAdapter({
      defaults: {
        command: {
          executable: 'fake-agent',
          defaultArgs: ['--headless'],
        },
        headless: {
          supported: true,
          requiredArgs: ['--json'],
        },
        timeout: {
          defaultMs: 30_000,
        },
      },
    });
    const runner = createFakeAgentCliRunner([
      {
        exitCode: 0,
        stdout: 'provider output',
        stderr: 'provider diagnostic',
      },
    ]);

    const output = await adapter.invoke({
      args: ['--model', 'agent-test'],
      input: 'hello',
    }, runner);

    expect(adapter.metadata).toMatchObject({
      protocolId: AGENT_CLI_PROTOCOL_ID,
      supportsHeadless: true,
      supportsTranscript: true,
      defaultTimeoutMs: 30_000,
      command: {
        executable: 'fake-agent',
        args: ['--headless'],
      },
    });
    expect(output.ok).toBe(true);
    expect(output.stdout).toBe('provider output');
    expect(output.stderr).toBe('provider diagnostic');
    expect(output.result).toMatchObject({
      ok: true,
      stdout: 'provider output',
      stderr: 'provider diagnostic',
    });
    expect(output.invocation).toEqual({
      command: {
        executable: 'fake-agent',
        args: ['--headless', '--json', '--model', 'agent-test'],
      },
      input: 'hello',
      timeoutMs: 30_000,
    });
  });

  it('creates provider adapters that stream injected runner events', async () => {
    const adapter = createAgentCliProviderAdapter({
      defaults: {
        command: {
          executable: 'fake-agent',
          defaultArgs: ['--headless'],
        },
        headless: {
          supported: true,
          requiredArgs: ['--json'],
        },
        timeout: {
          defaultMs: 30_000,
        },
      },
    });
    const finalResult = normalizeAgentCliRunResult({
      exitCode: 0,
      stdout: '{"type":"done"}\n',
    });
    const runner = createFakeAgentCliRunner([], [[
      { stream: 'stdout', text: '{"type":"message.delta","delta":"hello"}\n' },
      { stream: 'system', result: finalResult },
    ]]);

    const events = [];
    for await (const event of adapter.stream({
      args: ['--model', 'agent-test'],
      input: 'hello',
    }, runner)) {
      events.push(event);
    }

    expect(events).toEqual([
      { stream: 'stdout', text: '{"type":"message.delta","delta":"hello"}\n' },
      { stream: 'system', result: finalResult },
    ]);
    expect(runner.streamInvocations[0]).toEqual({
      command: {
        executable: 'fake-agent',
        args: ['--headless', '--json', '--model', 'agent-test'],
      },
      input: 'hello',
      timeoutMs: 30_000,
    });
  });

  it('passes cancellation and environment policy options through fake runner calls', async () => {
    const adapter = createAgentCliProviderAdapter({
      defaults: {
        command: {
          executable: 'fake-agent',
        },
        headless: {
          supported: true,
        },
        timeout: {
          defaultMs: 10_000,
        },
      },
    });
    const runner = createFakeAgentCliRunner();
    const runnerOptions: AgentCliRunnerOptions = {
      signal: { aborted: false },
      environmentPolicy: {
        mergeStrategy: 'allowlist',
        allowlist: ['NO_COLOR', 'CI'],
        env: { NO_COLOR: '1' },
      },
    };

    await adapter.invoke({ runnerOptions }, runner);

    expect(runner.invocations).toHaveLength(1);
    expect(runner.calls).toEqual([
      {
        invocation: {
          command: {
            executable: 'fake-agent',
          },
          timeoutMs: 10_000,
        },
        options: runnerOptions,
      },
    ]);
  });

  it('accepts Agent CLI provider catalog metadata without nested provider taxonomy', () => {
    const agentCli = {
      command: {
        executable: 'fake-agent',
        defaultArgs: ['--headless', '--json'],
      },
      install: {
        command: 'npm install -g fake-agent',
        packageName: 'fake-agent',
        versionCommand: 'fake-agent --version',
      },
      auth: {
        kind: 'none',
      },
      headless: {
        supported: true,
        requiredArgs: ['--headless'],
      },
      transcript: {
        supported: true,
        streams: ['stdout', 'stderr'],
        format: 'text',
      },
      timeout: {
        defaultMs: 30_000,
        maxMs: 120_000,
      },
      failureBehavior: {
        timeoutKind: 'timeout',
        nonZeroExitKind: 'non_zero_exit',
        spawnErrorKind: 'spawn_error',
      },
      targetIssueRefs: ['#280'],
      caveats: ['Reference test provider; does not execute a live CLI.'],
    };

    expect(AgentCliProviderMetadataSchema.parse(agentCli)).toEqual(agentCli);
    expect(ProviderDefinitionSchema.parse({
      vendorKey: 'fake-agent-cli',
      displayName: 'Fake Agent CLI',
      wellKnownProviderId: '20000000-0000-0000-0000-000000000177',
      providerType: 'text',
      providerClass: 'local_text',
      protocol: AGENT_CLI_PROTOCOL_ID,
      adapterKey: 'fake-agent-cli',
      defaultEndpoint: 'http://localhost',
      defaultModelId: 'fake-agent/default',
      auth: {
        required: false,
        purpose: 'api_key',
      },
      isLocal: true,
      agentCli,
    }).agentCli).toEqual(agentCli);
  });
});
