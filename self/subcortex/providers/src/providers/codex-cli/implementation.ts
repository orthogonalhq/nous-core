import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  type AgentCliRunner,
  type AgentCliRunnerOptions,
  normalizeAgentCliRunResult,
} from '../../protocols/agent-cli/index.js';
import { TextModelInputSchema, type TextModelInput } from '../../schemas/text-model-input.js';
import {
  CODEX_CLI_DEFAULT_MODEL_ID,
  CODEX_CLI_DEFAULT_TIMEOUT_MS,
  CODEX_CLI_MAX_TIMEOUT_MS,
  CODEX_CLI_PROVIDER_DEFINITION,
} from './definition.js';

export interface CodexCliProviderOptions {
  readonly runner?: AgentCliRunner;
  readonly runnerOptions?: AgentCliRunnerOptions;
  readonly executable?: string;
}

export interface CodexCliProcessRunnerOptions {
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
}

export const CODEX_CLI_INVOCATION_DEFAULTS: AgentCliInvocationDefaults = {
  command: {
    executable: CODEX_CLI_PROVIDER_DEFINITION.agentCli.command.executable,
    defaultArgs: CODEX_CLI_PROVIDER_DEFINITION.agentCli.command.defaultArgs,
  },
  headless: {
    supported: CODEX_CLI_PROVIDER_DEFINITION.agentCli.headless.supported,
    requiredArgs: CODEX_CLI_PROVIDER_DEFINITION.agentCli.headless.requiredArgs,
    nonInteractiveEnv: CODEX_CLI_PROVIDER_DEFINITION.agentCli.headless.nonInteractiveEnv,
  },
  timeout: {
    defaultMs: CODEX_CLI_DEFAULT_TIMEOUT_MS,
    maxMs: CODEX_CLI_MAX_TIMEOUT_MS,
  },
};

export const CODEX_CLI_AGENT_ADAPTER = createAgentCliProviderAdapter({
  defaults: CODEX_CLI_INVOCATION_DEFAULTS,
});

export function createCodexCliInvocationDefaults(
  executable: string = CODEX_CLI_PROVIDER_DEFINITION.agentCli.command.executable,
): AgentCliInvocationDefaults {
  return {
    ...CODEX_CLI_INVOCATION_DEFAULTS,
    command: {
      ...CODEX_CLI_INVOCATION_DEFAULTS.command,
      executable,
    },
  };
}

export class CodexCliProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly runner: AgentCliRunner;
  private readonly runnerOptions: AgentCliRunnerOptions | undefined;
  private readonly agentAdapter: typeof CODEX_CLI_AGENT_ADAPTER;

  constructor(config: ModelProviderConfig, options?: CodexCliProviderOptions) {
    this.config = config;
    this.runner = options?.runner ?? createCodexCliProcessRunner();
    this.runnerOptions = options?.runnerOptions;
    this.agentAdapter = createAgentCliProviderAdapter({
      defaults: createCodexCliInvocationDefaults(
        options?.executable ?? process.env.CODEX_CLI_BIN ?? process.env.NOUS_CODEX_CLI_BIN,
      ),
    });
  }

  getConfig(): ModelProviderConfig {
    return this.config;
  }

  async invoke(request: ModelRequest): Promise<ModelResponse> {
    const runner = this.runner;
    const input = this.validateInput(request.input);
    const lastMessage = await createLastMessageTarget();
    const start = Date.now();
    try {
      const result = await this.agentAdapter.invoke({
        args: this.invocationArgs(lastMessage.filePath),
        input: renderTextModelInput(input),
        metadata: {
          provider: 'codex-cli',
          providerId: this.config.id,
          modelId: this.config.modelId,
          traceId: request.traceId,
        },
        runnerOptions: this.mergeRunnerOptions(request),
      }, runner);

      if (!result.ok) {
        throw toProviderError(result.failure, result.stderr, result.stdout);
      }

      const finalMessage = await readLastMessage(lastMessage.filePath);
      return {
        output: finalMessage ?? result.stdout,
        providerId: this.config.id as ProviderId,
        usage: {
          computeMs: result.durationMs ?? Date.now() - start,
        },
        traceId: request.traceId,
      };
    } finally {
      await rm(lastMessage.dirPath, { recursive: true, force: true });
    }
  }

  async *stream(_request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    throw new NousError(
      'Codex CLI provider does not support streaming.',
      'PROVIDER_UNAVAILABLE',
      { provider: 'codex-cli', failureKind: 'unsupported' },
    );
  }

  private validateInput(input: unknown): TextModelInput {
    const result = TextModelInputSchema.safeParse(input);
    if (!result.success) {
      throw new ValidationError(
        'Invalid Codex CLI provider input',
        result.error.errors.map((error) => ({
          path: error.path.join('.'),
          message: error.message,
        })),
      );
    }
    return result.data;
  }

  private invocationArgs(lastMessagePath: string): readonly string[] {
    const stdinPromptArg = '-';
    const outputArgs = ['--output-last-message', lastMessagePath];
    if (
      this.config.modelId.length === 0 ||
      this.config.modelId === CODEX_CLI_DEFAULT_MODEL_ID
    ) {
      return [...outputArgs, stdinPromptArg];
    }

    return ['--model', this.config.modelId, ...outputArgs, stdinPromptArg];
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


async function createLastMessageTarget(): Promise<{ dirPath: string; filePath: string }> {
  const dirPath = await mkdtemp(join(tmpdir(), 'nous-codex-cli-'));
  return {
    dirPath,
    filePath: join(dirPath, `${randomUUID()}.txt`),
  };
}

async function readLastMessage(filePath: string): Promise<string | undefined> {
  try {
    const message = await readFile(filePath, 'utf8');
    const trimmed = message.trimEnd();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}


export function createCodexCliProcessRunner(
  options: CodexCliProcessRunnerOptions = {},
): AgentCliRunner {
  return {
    async run(invocation, runnerOptions) {
      return normalizeAgentCliRunResult(
        await runCodexCliProcessRaw(invocation, runnerOptions, options),
      );
    },
  };
}

function runCodexCliProcessRaw(
  invocation: AgentCliInvocation,
  runnerOptions: AgentCliRunnerOptions | undefined,
  options: CodexCliProcessRunnerOptions,
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
    let child;
    try {
      child = spawn(resolveSpawnExecutable(invocation.command.executable), [...(invocation.command.args ?? [])], {
        cwd: invocation.command.cwd,
        env: buildProcessEnv(invocation.command.env, runnerOptions, options),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: process.platform === 'win32',
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
    const timeout = invocation.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, invocation.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        error,
        timedOut,
        startedAt,
        endedAt: Date.now(),
      });
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
        startedAt,
        endedAt: Date.now(),
      });
    });

    child.stdin.end(invocation.input ?? '');
  });
}

function resolveSpawnExecutable(executable: string): string {
  return executable;
}

function buildProcessEnv(
  invocationEnv: Readonly<Record<string, string>> | undefined,
  runnerOptions: AgentCliRunnerOptions | undefined,
  options: CodexCliProcessRunnerOptions,
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
      'Codex CLI invocation failed.',
      'PROVIDER_UNAVAILABLE',
      { provider: 'codex-cli', stderr, stdout },
    );
  }

  return new NousError(
    stderr && stderr.trim().length > 0
      ? `${failure.message} ${stderr.trim().slice(0, 500)}`
      : failure.message,
    failure.kind === 'auth' ? 'PROVIDER_ERROR' : 'PROVIDER_UNAVAILABLE',
    {
      provider: 'codex-cli',
      failureKind: failure.kind,
      exitCode: failure.exitCode,
      signal: failure.signal,
      timedOut: failure.timedOut,
      stderr,
      stdout,
    },
  );
}
