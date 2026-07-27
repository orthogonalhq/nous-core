import {
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { NousError, ValidationError } from '@nous/shared';
import type {
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderId,
} from '@nous/shared';
import {
  createAgentCliProviderAdapter,
  type AgentCliFailure,
  type AgentCliInvocation,
  type AgentCliInvocationDefaults,
  type AgentCliRawResult,
  type AgentCliRunResult,
  type AgentCliRunner,
  type AgentCliRunnerOptions,
  type AgentCliStreamEvent,
  normalizeAgentCliRunResult,
} from '../../protocols/agent-cli/index.js';
import { TextModelInputSchema, type TextModelInput } from '../../schemas/text-model-input.js';
import {
  TABNINE_DEFAULT_TIMEOUT_MS,
  TABNINE_MAX_TIMEOUT_MS,
  TABNINE_PROVIDER_DEFINITION,
} from './definition.js';

export interface TabnineProviderOptions {
  readonly runner?: AgentCliRunner;
  readonly runnerOptions?: AgentCliRunnerOptions;
  readonly executable?: string;
}

export interface TabnineProcessRunnerOptions {
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly commandResolver?: TabnineCommandResolver;
  readonly killEscalationDelayMs?: number;
  readonly platform?: NodeJS.Platform;
  readonly spawn?: TabnineSpawn;
}

const TABNINE_NOUS_BIN_ENV = 'NOUS_TABNINE_BIN';
const TABNINE_BIN_ENV = 'TABNINE_BIN';

export type TabnineCommandResolver = (
  command: string,
  args: readonly string[],
  options: { readonly env?: NodeJS.ProcessEnv },
) => string;

export type TabnineSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

export const TABNINE_DEFAULT_ENV_ALLOWLIST = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'NOUS_TABNINE_BIN',
  'TABNINE_BIN',
  'TABNINE_TOKEN',
  'TABNINE_HOST',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
] as const;

const TABNINE_DEFAULT_KILL_ESCALATION_DELAY_MS = 2_000;

export const TABNINE_INVOCATION_DEFAULTS: AgentCliInvocationDefaults = {
  command: {
    executable: TABNINE_PROVIDER_DEFINITION.agentCli.command.executable,
    defaultArgs: TABNINE_PROVIDER_DEFINITION.agentCli.command.defaultArgs,
  },
  headless: {
    supported: TABNINE_PROVIDER_DEFINITION.agentCli.headless.supported,
    requiredArgs: TABNINE_PROVIDER_DEFINITION.agentCli.headless.requiredArgs,
    nonInteractiveEnv: TABNINE_PROVIDER_DEFINITION.agentCli.headless.nonInteractiveEnv,
  },
  timeout: {
    defaultMs: TABNINE_DEFAULT_TIMEOUT_MS,
    maxMs: TABNINE_MAX_TIMEOUT_MS,
  },
};

export const TABNINE_AGENT_ADAPTER = createAgentCliProviderAdapter({
  defaults: TABNINE_INVOCATION_DEFAULTS,
});

export function createTabnineInvocationDefaults(
  executable: string = TABNINE_PROVIDER_DEFINITION.agentCli.command.executable,
): AgentCliInvocationDefaults {
  return {
    ...TABNINE_INVOCATION_DEFAULTS,
    command: {
      ...TABNINE_INVOCATION_DEFAULTS.command,
      executable,
    },
  };
}

export class TabnineProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly runner: AgentCliRunner;
  private readonly runnerOptions: AgentCliRunnerOptions | undefined;
  private readonly agentAdapter: typeof TABNINE_AGENT_ADAPTER;

  constructor(config: ModelProviderConfig, options?: TabnineProviderOptions) {
    this.config = config;
    this.runner = options?.runner ?? createTabnineProcessRunner();
    this.runnerOptions = options?.runnerOptions;
    const executable = selectTabnineExecutable({
      explicitExecutable: options?.executable,
    });
    this.agentAdapter = createAgentCliProviderAdapter({
      defaults: createTabnineInvocationDefaults(executable),
    });
  }

  getConfig(): ModelProviderConfig {
    return this.config;
  }

  async invoke(request: ModelRequest): Promise<ModelResponse> {
    const runner = this.runner;
    const input = this.validateInput(request.input);
    const renderedPrompt = renderTextModelInput(input);
    const start = Date.now();
    const invocationInput = {
      args: this.invocationArgs(renderedPrompt),
      metadata: {
        provider: 'tabnine',
        providerId: this.config.id,
        modelId: this.config.modelId,
        traceId: request.traceId,
      },
      runnerOptions: this.mergeRunnerOptions(request),
    };

    const result = await this.agentAdapter.invoke(invocationInput, runner);

    if (!result.ok) {
      throw toProviderError(result.failure, result.stderr, result.stdout);
    }

    return {
      output: result.stdout,
      providerId: this.config.id as ProviderId,
      usage: {
        computeMs: result.durationMs ?? Date.now() - start,
      },
      traceId: request.traceId,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const runner = this.runner;
    const input = this.validateInput(request.input);
    const renderedPrompt = renderTextModelInput(input);
    const state: TabnineStreamState = {
      emittedContent: false,
      finalResult: undefined,
    };

    const invocationInput = {
      args: this.invocationArgs(renderedPrompt),
      metadata: {
        provider: 'tabnine',
        providerId: this.config.id,
        modelId: this.config.modelId,
        traceId: request.traceId,
      },
      runnerOptions: this.mergeRunnerOptions(request),
    };

    try {
      for await (const event of this.agentAdapter.stream(invocationInput, runner)) {
        if (event.stream === 'system') {
          state.finalResult = event.result;
          continue;
        }

        if (event.stream !== 'stdout') continue;

        if (event.text.length > 0) {
          state.emittedContent = true;
          yield { content: event.text, done: false };
        }
      }

      if (state.finalResult === undefined) {
        throw new NousError(
          'Tabnine streaming ended without a process result.',
          'PROVIDER_UNAVAILABLE',
          { provider: 'tabnine', failureKind: 'unknown' },
        );
      }

      if (!state.finalResult.ok) {
        throw toProviderError(
          state.finalResult.failure,
          state.finalResult.stderr,
          state.finalResult.stdout,
        );
      }

      if (!state.emittedContent && state.finalResult.stdout.length > 0) {
        yield { content: state.finalResult.stdout, done: false };
      }

      yield { content: '', done: true };
    } catch (error) {
      if (error instanceof NousError) throw error;
      throw new NousError(
        `Tabnine streaming failed: ${error instanceof Error ? error.message : String(error)}`,
        'PROVIDER_UNAVAILABLE',
        { provider: 'tabnine', failureKind: 'unknown' },
      );
    }
  }

  private validateInput(input: unknown): TextModelInput {
    const result = TextModelInputSchema.safeParse(input);
    if (!result.success) {
      throw new ValidationError(
        'Invalid Tabnine provider input',
        result.error.errors.map((error) => ({
          path: error.path.join('.'),
          message: error.message,
        })),
      );
    }
    return result.data;
  }

  private invocationArgs(prompt: string): readonly string[] {
    // Tabnine selects its model via ~/.tabnine/agent/settings.json rather than a
    // CLI flag, so the one-shot invocation carries only the prompt, yielding
    // `tabnine -p "<prompt>"`. The `-y` auto-accept flag is intentionally NOT
    // passed by default (headless.requiredArgs is empty); enabling auto-accept is
    // an explicit, trusted opt-in because it lets the agent act without confirmation.
    return ['-p', prompt];
  }

  private mergeRunnerOptions(request: ModelRequest): AgentCliRunnerOptions {
    const signal = request.abortSignal ?? this.runnerOptions?.signal;
    const environmentPolicy = this.runnerOptions?.environmentPolicy ?? {
      mergeStrategy: 'allowlist' as const,
      allowlist: TABNINE_DEFAULT_ENV_ALLOWLIST,
    };

    return {
      environmentPolicy,
      ...this.runnerOptions,
      ...(signal ? { signal } : {}),
    };
  }
}

export function selectTabnineExecutable(
  options: {
    readonly explicitExecutable?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
  } = {},
): string {
  const env = options.env ?? process.env;
  return options.explicitExecutable
    ?? env[TABNINE_NOUS_BIN_ENV]
    ?? env[TABNINE_BIN_ENV]
    ?? TABNINE_PROVIDER_DEFINITION.agentCli.command.executable;
}

export function resolveTabnineExecutable(
  executable: string = TABNINE_PROVIDER_DEFINITION.agentCli.command.executable,
  options: {
    readonly commandResolver?: TabnineCommandResolver;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly platform?: NodeJS.Platform;
  } = {},
): string {
  if (executable !== TABNINE_PROVIDER_DEFINITION.agentCli.command.executable) {
    return executable;
  }

  const platform = options.platform ?? process.platform;
  const candidates = platform === 'win32'
    ? resolveExecutableCandidates('where.exe', ['tabnine'], options)
    : resolveExecutableCandidates('which', ['-a', 'tabnine'], options);
  const systemCandidates = candidates.filter((candidate) => !isNodeModulesBinCandidate(candidate));

  if (platform === 'win32') {
    return systemCandidates.find((candidate) => !isWindowsShimPath(candidate))
      ?? systemCandidates[0]
      ?? executable;
  }

  return systemCandidates[0] ?? executable;
}

function isWindowsShimPath(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return lower.endsWith('.cmd') || lower.endsWith('.bat');
}

function resolveExecutableCandidates(
  command: string,
  args: readonly string[],
  options: {
    readonly commandResolver?: TabnineCommandResolver;
    readonly env?: Readonly<Record<string, string | undefined>>;
  },
): readonly string[] {
  const commandResolver = options.commandResolver ?? defaultCommandResolver;
  try {
    return commandResolver(command, args, { env: toProcessEnv(options.env) })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function defaultCommandResolver(
  command: string,
  args: readonly string[],
  options: { readonly env?: NodeJS.ProcessEnv },
): string {
  return execFileSync(command, [...args], {
    encoding: 'utf8',
    env: options.env,
  });
}

function isNodeModulesBinCandidate(candidate: string): boolean {
  return candidate.replace(/\\/g, '/').toLowerCase().includes('/node_modules/.bin/');
}

function toProcessEnv(env: Readonly<Record<string, string | undefined>> | undefined): NodeJS.ProcessEnv | undefined {
  if (!env) return undefined;
  const processEnv: NodeJS.ProcessEnv = {};
  assignDefinedEnv(processEnv, env);
  return processEnv;
}

interface TabnineStreamState {
  emittedContent: boolean;
  finalResult: AgentCliRunResult | undefined;
}

export function createTabnineProcessRunner(
  options: TabnineProcessRunnerOptions = {},
): AgentCliRunner {
  return {
    async run(invocation, runnerOptions) {
      return normalizeAgentCliRunResult(
        await runTabnineProcessRaw(invocation, runnerOptions, options),
      );
    },
    async *stream(invocation, runnerOptions) {
      const queue: AgentCliStreamEvent[] = [];
      let wake: (() => void) | undefined;
      let completed = false;

      const push = (event: AgentCliStreamEvent): void => {
        queue.push(event);
        wake?.();
        wake = undefined;
      };

      const waitForEvent = (): Promise<void> => {
        if (queue.length > 0 || completed) return Promise.resolve();
        return new Promise((resolve) => {
          wake = resolve;
        });
      };

      void runTabnineProcessRaw(invocation, runnerOptions, options, (event) => {
        push(event);
      }).then((rawResult) => {
        push({ stream: 'system', result: normalizeAgentCliRunResult(rawResult) });
      }).finally(() => {
        completed = true;
        wake?.();
        wake = undefined;
      });

      while (!completed || queue.length > 0) {
        await waitForEvent();
        while (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    },
  };
}

function runTabnineProcessRaw(
  invocation: AgentCliInvocation,
  runnerOptions: AgentCliRunnerOptions | undefined,
  options: TabnineProcessRunnerOptions,
  onTranscriptEvent?: (event: AgentCliStreamEvent) => void,
): Promise<AgentCliRawResult> {
  const startedAt = Date.now();
  if (runnerOptions?.signal?.aborted) {
    return Promise.resolve({
      startedAt,
      endedAt: Date.now(),
      error: new Error('Agent CLI invocation aborted before start.'),
    });
  }

  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      const env = buildProcessEnv(invocation.command.env, runnerOptions, options);
      const spawnProcess = options.spawn ?? spawn;
      child = spawnProcess(resolveSpawnExecutable(invocation.command.executable, {
        commandResolver: options.commandResolver,
        env,
        platform: options.platform,
      }), [...(invocation.command.args ?? [])], {
        cwd: invocation.command.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
    } catch (error) {
      resolve({
        error,
        startedAt,
        endedAt: Date.now(),
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let abortError: Error | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let escalationTimeout: NodeJS.Timeout | undefined;
    const killEscalationDelayMs = Math.max(
      0,
      Math.trunc(options.killEscalationDelayMs ?? TABNINE_DEFAULT_KILL_ESCALATION_DELAY_MS),
    );
    const clearTimers = (): void => {
      if (timeout) clearTimeout(timeout);
      if (escalationTimeout) clearTimeout(escalationTimeout);
      timeout = undefined;
      escalationTimeout = undefined;
    };
    let handleAbort: () => void = () => undefined;
    const settle = (raw: AgentCliRawResult): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      runnerOptions?.signal?.removeEventListener?.('abort', handleAbort);
      resolve(raw);
    };
    const killChild = (signal: NodeJS.Signals): void => {
      try {
        child.kill(signal);
      } catch {
        // The process may have already exited; close/error will settle it.
      }
    };
    const terminateChild = (reason: 'abort' | 'timeout'): void => {
      if (settled) return;
      if (reason === 'timeout') {
        timedOut = true;
      } else {
        abortError = new Error('Agent CLI invocation aborted.');
      }

      killChild('SIGTERM');
      if (!escalationTimeout) {
        escalationTimeout = setTimeout(() => {
          killChild('SIGKILL');
          settle({
            stdout,
            stderr,
            error: abortError,
            timedOut,
            signal: 'SIGKILL',
            startedAt,
            endedAt: Date.now(),
          });
        }, killEscalationDelayMs);
      }
    };
    handleAbort = (): void => terminateChild('abort');

    timeout = invocation.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
        terminateChild('timeout');
      }, invocation.timeoutMs);
    runnerOptions?.signal?.addEventListener?.('abort', handleAbort, { once: true });
    if (runnerOptions?.signal?.aborted) {
      handleAbort();
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      onTranscriptEvent?.({ stream: 'stdout', text: chunk, timestamp: new Date().toISOString() });
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      onTranscriptEvent?.({ stream: 'stderr', text: chunk, timestamp: new Date().toISOString() });
    });
    child.on('error', (error) => {
      settle({
        stdout,
        stderr,
        error,
        timedOut,
        startedAt,
        endedAt: Date.now(),
      });
    });
    child.on('close', (exitCode, signal) => {
      settle({
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
        startedAt,
        endedAt: Date.now(),
      });
    });

    try {
      child.stdin.end(invocation.input ?? '');
    } catch (error) {
      settle({
        stdout,
        stderr,
        error,
        timedOut,
        startedAt,
        endedAt: Date.now(),
      });
    }
  });
}

function resolveSpawnExecutable(
  executable: string,
  options: {
    readonly commandResolver?: TabnineCommandResolver;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly platform?: NodeJS.Platform;
  },
): string {
  const resolved = resolveTabnineExecutable(executable, options);
  const platform = options.platform ?? process.platform;
  if (platform === 'win32' && isWindowsShimPath(resolved)) {
    throw new NousError(
      `Tabnine resolved to a Windows shim (${resolved}) that cannot be launched safely `
        + `without a shell. Set ${TABNINE_NOUS_BIN_ENV} or ${TABNINE_BIN_ENV} to a directly `
        + `executable Tabnine binary or Node entrypoint (for example the tabnine.js under `
        + `node_modules or an installed tabnine.exe).`,
      'PROVIDER_UNAVAILABLE',
      { provider: 'tabnine', failureKind: 'spawn_error', executable: resolved },
    );
  }
  return resolved;
}

function buildProcessEnv(
  invocationEnv: Readonly<Record<string, string>> | undefined,
  runnerOptions: AgentCliRunnerOptions | undefined,
  options: TabnineProcessRunnerOptions,
): NodeJS.ProcessEnv {
  const baseEnv = options.baseEnv ?? process.env;
  const policy = runnerOptions?.environmentPolicy ?? {
    mergeStrategy: 'allowlist' as const,
    allowlist: TABNINE_DEFAULT_ENV_ALLOWLIST,
  };
  const env: NodeJS.ProcessEnv = {};

  if (policy.mergeStrategy === 'explicit') {
    assignDefinedEnv(env, baseEnv);
  } else if (policy.mergeStrategy === 'allowlist') {
    for (const key of policy.allowlist ?? []) {
      const value = baseEnv[key];
      if (value !== undefined && isValidEnvKey(key)) env[key] = value;
    }
  }

  assignDefinedEnv(env, policy?.env);
  assignDefinedEnv(env, invocationEnv);
  return env;
}

function assignDefinedEnv(
  target: NodeJS.ProcessEnv,
  source: Readonly<Record<string, string | undefined>> | undefined,
): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && isValidEnvKey(key)) {
      target[key] = value;
    }
  }
}

function isValidEnvKey(key: string): boolean {
  return key.length > 0 && !key.includes('=');
}

function renderTextModelInput(input: TextModelInput): string {
  if ('prompt' in input) {
    return input.prompt;
  }

  const sections: string[] = [];
  if (typeof input.system === 'string' && input.system.trim().length > 0) {
    sections.push(input.system.trim());
  } else if (Array.isArray(input.system) && input.system.length > 0) {
    sections.push(JSON.stringify(input.system, null, 2));
  }

  for (const message of input.messages) {
    sections.push(`${message.role}: ${renderMessageContent(message.content)}`);
  }

  if (input.tools && input.tools.length > 0) {
    sections.push(`Available tools:\n${JSON.stringify(input.tools, null, 2)}`);
  }

  return sections.join('\n\n');
}

function renderMessageContent(content: string | readonly unknown[]): string {
  return typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);
}

function toProviderError(
  failure: AgentCliFailure | undefined,
  stderr?: string,
  stdout?: string,
): NousError {
  if (!failure) {
    return new NousError(
      'Tabnine invocation failed.',
      'PROVIDER_UNAVAILABLE',
      { provider: 'tabnine', stderr, stdout },
    );
  }

  return new NousError(
    stderr && stderr.trim().length > 0
      ? `${failure.message} ${stderr.trim().slice(0, 500)}`
      : failure.message,
    failure.kind === 'auth' ? 'PROVIDER_ERROR' : 'PROVIDER_UNAVAILABLE',
    {
      provider: 'tabnine',
      failureKind: failure.kind,
      exitCode: failure.exitCode,
      signal: failure.signal,
      timedOut: failure.timedOut,
      stderr,
      stdout,
    },
  );
}
