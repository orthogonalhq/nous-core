/**
 * AmpProvider — IModelProvider implementation for the Amp CLI coding agent.
 *
 * Spawns the `amp` CLI process through the shared agent-cli runner seam
 * (same pattern as GitHubCopilotCliProvider): the runner is injectable so
 * tests can substitute `createFakeAgentCliRunner` instead of a real process.
 */
import { spawn } from 'node:child_process';
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
  normalizeAgentCliRunResult,
  type AgentCliFailure,
  type AgentCliInvocation,
  type AgentCliInvocationDefaults,
  type AgentCliRawResult,
  type AgentCliRunner,
  type AgentCliRunnerOptions,
} from '../../protocols/agent-cli/index.js';
import { TextModelInputSchema, type TextModelInput } from '../../schemas/text-model-input.js';
import { providerAdapter } from './adapter.js';
import {
  AMP_DEFAULT_TIMEOUT_MS,
  AMP_MAX_TIMEOUT_MS,
  providerDefinition as AMP_PROVIDER_DEFINITION,
} from './definition.js';

export const AMP_INVOCATION_DEFAULTS: AgentCliInvocationDefaults = {
  command: {
    executable: AMP_PROVIDER_DEFINITION.agentCli.command.executable,
    defaultArgs: AMP_PROVIDER_DEFINITION.agentCli.command.defaultArgs,
  },
  headless: {
    supported: AMP_PROVIDER_DEFINITION.agentCli.headless.supported,
    requiredArgs: AMP_PROVIDER_DEFINITION.agentCli.headless.requiredArgs,
  },
  timeout: {
    defaultMs: AMP_DEFAULT_TIMEOUT_MS,
    maxMs: AMP_MAX_TIMEOUT_MS,
  },
};

export const AMP_AGENT_ADAPTER = createAgentCliProviderAdapter({
  defaults: AMP_INVOCATION_DEFAULTS,
});

/** Grace period after SIGTERM before escalating to SIGKILL so a timed-out `amp` process can't hang the lane. */
export const AMP_PROCESS_SIGTERM_GRACE_MS = 2_000;

export interface AmpProcessRunnerOptions {
  /** Overrides the parent environment used as the base for the child process (testing seam). */
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  /** Overrides the SIGTERM→SIGKILL grace period in ms (testing seam). Defaults to AMP_PROCESS_SIGTERM_GRACE_MS. */
  readonly sigtermGraceMs?: number;
}

export function createAmpProcessRunner(
  options: AmpProcessRunnerOptions = {},
): AgentCliRunner {
  return {
    async run(invocation: AgentCliInvocation, runnerOptions?: AgentCliRunnerOptions) {
      return normalizeAgentCliRunResult(
        await runAmpProcessRaw(invocation, runnerOptions, options),
      );
    },
  };
}

function runAmpProcessRaw(
  invocation: AgentCliInvocation,
  runnerOptions: AgentCliRunnerOptions | undefined,
  options: AmpProcessRunnerOptions,
): Promise<AgentCliRawResult> {
  const startedAt = Date.now();

  // Abort is honored only before process start: the shared AgentCliAbortSignal is a
  // snapshot ({ aborted }) with no events, so once `amp` is spawned the request runs to
  // completion or timeout. This mirrors github-copilot-cli's documented limitation.
  if (runnerOptions?.signal?.aborted) {
    return Promise.resolve({
      startedAt,
      endedAt: Date.now(),
      error: new Error('Agent CLI invocation aborted before start.'),
    });
  }

  return new Promise((resolve) => {
    let child;
    try {
      const spawnEnv = buildProcessEnv(invocation.command.env, runnerOptions, options);
      child = spawn(
        invocation.command.executable,
        [...(invocation.command.args ?? [])],
        {
          cwd: invocation.command.cwd,
          env: spawnEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
    } catch (error) {
      resolve({ error, startedAt, endedAt: Date.now() });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const timeout = invocation.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          // If `amp` ignores SIGTERM, force-kill and resolve after the grace period
          // so a timeout always settles instead of hanging the lane.
          forceKillTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill('SIGKILL');
            resolve({ stdout, stderr, timedOut, startedAt, endedAt: Date.now() });
          }, options.sigtermGraceMs ?? AMP_PROCESS_SIGTERM_GRACE_MS);
        }, invocation.timeoutMs);

    const clearTimers = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
    };

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    }

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve({ stdout, stderr, error, timedOut, startedAt, endedAt: Date.now() });
    });

    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve({ exitCode, signal, stdout, stderr, timedOut, startedAt, endedAt: Date.now() });
    });

    // Deliver the prompt through stdin so it is not exposed via argv (process listings
    // or argv-based logs). The child may exit before the write drains, which would
    // surface EPIPE/ERR_STREAM_DESTROYED on stdin; swallow those so a broken pipe never
    // crashes the host. The real outcome is captured by the close/error handlers above.
    if (child.stdin) {
      child.stdin.on('error', () => { /* ignore broken pipe / write-after-end on early child exit */ });
      try {
        child.stdin.end(invocation.input ?? '');
      } catch {
        /* ignore synchronous write-after-destroy errors */
      }
    }
  });
}

function buildProcessEnv(
  invocationEnv: Readonly<Record<string, string>> | undefined,
  runnerOptions: AgentCliRunnerOptions | undefined,
  options: AmpProcessRunnerOptions,
): NodeJS.ProcessEnv {
  const baseEnv = options.baseEnv ?? process.env;
  const policy = runnerOptions?.environmentPolicy;
  const env: NodeJS.ProcessEnv = {};

  if (!policy || policy.mergeStrategy === 'explicit') {
    assignDefinedEnv(env, baseEnv);
  } else if (policy.mergeStrategy === 'allowlist') {
    for (const key of policy.allowlist ?? []) {
      const value = baseEnv[key];
      if (value !== undefined && isValidEnvKey(key)) env[key] = value;
    }
  }
  // mergeStrategy === 'none' inherits nothing from the parent environment.

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

export class AmpProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly runner: AgentCliRunner;
  private readonly runnerOptions: AgentCliRunnerOptions | undefined;

  constructor(
    config: ModelProviderConfig,
    options?: { runner?: AgentCliRunner; runnerOptions?: AgentCliRunnerOptions },
  ) {
    this.config = config;
    this.runner = options?.runner ?? createAmpProcessRunner();
    this.runnerOptions = options?.runnerOptions;
  }

  getConfig(): ModelProviderConfig {
    return this.config;
  }

  async invoke(request: ModelRequest): Promise<ModelResponse> {
    const input = this.validateInput(request.input);
    const promptString = formatAmpInput(input);
    const start = Date.now();

    const result = await AMP_AGENT_ADAPTER.invoke(
      {
        input: promptString,
        metadata: {
          provider: 'amp',
          providerId: this.config.id,
          modelId: this.config.modelId,
          traceId: request.traceId,
        },
        runnerOptions: this.mergeRunnerOptions(request),
      },
      this.runner,
    );

    if (!result.ok) {
      throw toProviderError(result.failure, result.stderr, result.stdout);
    }

    const parsed = providerAdapter.create().parseResponse(result.stdout, request.traceId);

    return {
      output: parsed.response,
      providerId: this.config.id as ProviderId,
      usage: {
        computeMs: result.durationMs ?? Date.now() - start,
      },
      traceId: request.traceId,
    };
  }

  stream(_request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    // Amp declares streaming: false — streaming is not supported.
    throw new NousError(
      'Amp CLI provider does not support streaming. Use invoke().',
      'PROVIDER_UNAVAILABLE',
    );
  }

  private validateInput(input: unknown): TextModelInput {
    const result = TextModelInputSchema.safeParse(input);
    if (!result.success) {
      throw new ValidationError(
        'Invalid input for AmpProvider',
        result.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      );
    }
    return result.data;
  }

  private mergeRunnerOptions(request: ModelRequest): AgentCliRunnerOptions | undefined {
    const signal = request.abortSignal
      ? { aborted: request.abortSignal.aborted }
      : this.runnerOptions?.signal;

    if (!signal && !this.runnerOptions) {
      return undefined;
    }

    return {
      ...this.runnerOptions,
      ...(signal ? { signal } : {}),
    };
  }
}

function formatAmpInput(input: TextModelInput): string {
  if ('prompt' in input) {
    return input.prompt;
  }

  const system = typeof input.system === 'string'
    ? input.system
    : Array.isArray(input.system)
      ? input.system.map(String).join('\n\n')
      : '';

  const lines: string[] = [];
  if (system.trim().length > 0) {
    lines.push(system.trim());
    lines.push('');
  }

  for (const message of input.messages) {
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);
    lines.push(`${message.role}: ${content}`);
  }

  return lines.join('\n');
}

function toProviderError(
  failure: AgentCliFailure | undefined,
  stderr?: string,
  stdout?: string,
): NousError {
  if (!failure) {
    return new NousError(
      '[amp] invocation failed',
      'PROVIDER_UNAVAILABLE',
      { provider: 'amp', stderr, stdout },
    );
  }

  return new NousError(
    stderr && stderr.trim().length > 0
      ? `[amp] ${failure.message} ${stderr.trim().slice(0, 500)}`
      : `[amp] ${failure.message}`,
    'PROVIDER_UNAVAILABLE',
    {
      provider: 'amp',
      failureKind: failure.kind,
      exitCode: failure.exitCode,
      signal: failure.signal,
      timedOut: failure.timedOut,
      stderr,
      stdout,
    },
  );
}