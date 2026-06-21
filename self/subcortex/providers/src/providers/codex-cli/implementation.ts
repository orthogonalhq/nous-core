import { execFileSync, spawn } from 'node:child_process';
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
  type AgentCliRunResult,
  type AgentCliRunner,
  type AgentCliRunnerOptions,
  type AgentCliStreamEvent,
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
  readonly commandResolver?: CodexCliCommandResolver;
  readonly platform?: NodeJS.Platform;
}

const CODEX_CLI_IGNORE_USER_CONFIG_ARG = '--ignore-user-config';
const CODEX_CLI_SERVICE_TIER_OVERRIDE_ARGS = ['-c', 'service_tier=fast'] as const;
const CODEX_CLI_NOUS_BIN_ENV = 'NOUS_CODEX_CLI_BIN';
const CODEX_CLI_BIN_ENV = 'CODEX_CLI_BIN';

export type CodexCliCommandResolver = (
  command: string,
  args: readonly string[],
  options: { readonly env?: NodeJS.ProcessEnv },
) => string;

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
  options: {
    readonly ignoreUserConfig?: boolean;
    readonly serviceTierOverride?: boolean;
  } = {},
): AgentCliInvocationDefaults {
  const defaultArgs = options.ignoreUserConfig === false
    ? CODEX_CLI_INVOCATION_DEFAULTS.command.defaultArgs?.filter(
      (arg) => arg !== CODEX_CLI_IGNORE_USER_CONFIG_ARG,
    )
    : CODEX_CLI_INVOCATION_DEFAULTS.command.defaultArgs;
  const compatibilityArgs = options.serviceTierOverride === true
    ? addArgsAfterExec(defaultArgs, CODEX_CLI_SERVICE_TIER_OVERRIDE_ARGS)
    : defaultArgs;

  return {
    ...CODEX_CLI_INVOCATION_DEFAULTS,
    command: {
      ...CODEX_CLI_INVOCATION_DEFAULTS.command,
      executable,
      defaultArgs: compatibilityArgs,
    },
  };
}

export class CodexCliProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly runner: AgentCliRunner;
  private readonly runnerOptions: AgentCliRunnerOptions | undefined;
  private readonly agentAdapter: typeof CODEX_CLI_AGENT_ADAPTER;
  private readonly fallbackAgentAdapter: typeof CODEX_CLI_AGENT_ADAPTER;

  constructor(config: ModelProviderConfig, options?: CodexCliProviderOptions) {
    this.config = config;
    this.runner = options?.runner ?? createCodexCliProcessRunner();
    this.runnerOptions = options?.runnerOptions;
    const executable = selectCodexCliExecutable({
      explicitExecutable: options?.executable,
    });
    this.agentAdapter = createAgentCliProviderAdapter({
      defaults: createCodexCliInvocationDefaults(executable),
    });
    this.fallbackAgentAdapter = createAgentCliProviderAdapter({
      defaults: createCodexCliInvocationDefaults(executable, {
        ignoreUserConfig: false,
        serviceTierOverride: true,
      }),
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
      const invocationInput = {
        args: this.invocationArgs(lastMessage.filePath),
        input: renderTextModelInput(input),
        metadata: {
          provider: 'codex-cli',
          providerId: this.config.id,
          modelId: this.config.modelId,
          traceId: request.traceId,
        },
        runnerOptions: this.mergeRunnerOptions(request),
      };
      let result = await this.agentAdapter.invoke(invocationInput, runner);

      if (!result.ok && isIgnoreUserConfigUnsupported(result.failure, result.stderr, result.stdout)) {
        result = await this.fallbackAgentAdapter.invoke(invocationInput, runner);
        if (!result.ok && isServiceTierDefaultUnsupported(result.failure, result.stderr, result.stdout)) {
          throw createServiceTierDefaultError(result.failure, result.stderr, result.stdout);
        }
      }

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

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const runner = this.runner;
    const input = this.validateInput(request.input);
    const lastMessage = await createLastMessageTarget();
    const state: CodexCliStreamState = {
      accumulatedContent: '',
      emittedContent: false,
      usage: undefined,
      finalResult: undefined,
    };

    try {
      const invocationInput = {
        args: this.streamingInvocationArgs(lastMessage.filePath),
        input: renderTextModelInput(input),
        metadata: {
          provider: 'codex-cli',
          providerId: this.config.id,
          modelId: this.config.modelId,
          traceId: request.traceId,
          streamFormat: 'codex-exec-jsonl',
        },
        runnerOptions: this.mergeRunnerOptions(request),
      };

      yield* this.streamAttempt(this.agentAdapter, invocationInput, runner, state);

      if (
        state.finalResult !== undefined &&
        !state.finalResult.ok &&
        !state.emittedContent &&
        isIgnoreUserConfigUnsupported(
          state.finalResult.failure,
          state.finalResult.stderr,
          state.finalResult.stdout,
        )
      ) {
        clearCodexCliFinalResult(state);
        yield* this.streamAttempt(this.fallbackAgentAdapter, invocationInput, runner, state);
        const fallbackResult = getCodexCliFinalResult(state);
        if (
          fallbackResult !== undefined &&
          !fallbackResult.ok &&
          isServiceTierDefaultUnsupported(
            fallbackResult.failure,
            fallbackResult.stderr,
            fallbackResult.stdout,
          )
        ) {
          throw createServiceTierDefaultError(
            fallbackResult.failure,
            fallbackResult.stderr,
            fallbackResult.stdout,
          );
        }
      }

      if (state.finalResult === undefined) {
        throw new NousError(
          'Codex CLI streaming ended without a process result.',
          'PROVIDER_UNAVAILABLE',
          { provider: 'codex-cli', failureKind: 'unknown' },
        );
      }

      if (!state.finalResult.ok) {
        throw toProviderError(
          state.finalResult.failure,
          state.finalResult.stderr,
          state.finalResult.stdout,
        );
      }

      const finalMessage = await readLastMessage(lastMessage.filePath);
      if (!state.emittedContent && finalMessage !== undefined) {
        state.accumulatedContent += finalMessage;
        state.emittedContent = true;
        yield { content: finalMessage, done: false };
      }

      yield {
        content: '',
        done: true,
        ...(state.usage !== undefined ? { usage: state.usage } : {}),
      };
    } catch (error) {
      if (error instanceof NousError) throw error;
      throw new NousError(
        `Codex CLI streaming failed: ${error instanceof Error ? error.message : String(error)}`,
        'PROVIDER_UNAVAILABLE',
        { provider: 'codex-cli', failureKind: 'unknown' },
      );
    } finally {
      await rm(lastMessage.dirPath, { recursive: true, force: true });
    }
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

  private streamingInvocationArgs(lastMessagePath: string): readonly string[] {
    return ['--json', ...this.invocationArgs(lastMessagePath)];
  }

  private async *streamAttempt(
    adapter: typeof CODEX_CLI_AGENT_ADAPTER,
    invocationInput: Parameters<typeof CODEX_CLI_AGENT_ADAPTER.invoke>[0],
    runner: AgentCliRunner,
    state: CodexCliStreamState,
  ): AsyncIterable<ModelStreamChunk> {
    const parser = new CodexCliJsonStreamParser();

    for await (const event of adapter.stream(invocationInput, runner)) {
      if (event.stream === 'system') {
        state.finalResult = event.result;
        continue;
      }

      if (event.stream !== 'stdout') continue;

      for (const parsed of parser.push(event.text)) {
        if (parsed.usage !== undefined) {
          state.usage = parsed.usage;
        }
        if (parsed.content.length > 0) {
          state.accumulatedContent += parsed.content;
          state.emittedContent = true;
          yield {
            content: parsed.content,
            done: false,
          };
        }
      }
    }

    for (const parsed of parser.finish()) {
      if (parsed.usage !== undefined) {
        state.usage = parsed.usage;
      }
      if (parsed.content.length > 0) {
        state.accumulatedContent += parsed.content;
        state.emittedContent = true;
        yield {
          content: parsed.content,
          done: false,
        };
      }
    }
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

export function selectCodexCliExecutable(
  options: {
    readonly explicitExecutable?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
  } = {},
): string {
  const env = options.env ?? process.env;
  return options.explicitExecutable
    ?? env[CODEX_CLI_NOUS_BIN_ENV]
    ?? env[CODEX_CLI_BIN_ENV]
    ?? CODEX_CLI_PROVIDER_DEFINITION.agentCli.command.executable;
}

export function resolveCodexCliExecutable(
  executable: string = CODEX_CLI_PROVIDER_DEFINITION.agentCli.command.executable,
  options: {
    readonly commandResolver?: CodexCliCommandResolver;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly platform?: NodeJS.Platform;
  } = {},
): string {
  if (executable !== CODEX_CLI_PROVIDER_DEFINITION.agentCli.command.executable) {
    return executable;
  }

  const platform = options.platform ?? process.platform;
  const candidates = platform === 'win32'
    ? resolveExecutableCandidates('where.exe', ['codex'], options)
    : resolveExecutableCandidates('which', ['-a', 'codex'], options);
  const systemCandidates = candidates.filter((candidate) => !isNodeModulesBinCandidate(candidate));

  if (platform === 'win32') {
    return systemCandidates.find((candidate) => candidate.toLowerCase().endsWith('.cmd'))
      ?? systemCandidates[0]
      ?? executable;
  }

  return systemCandidates[0] ?? executable;
}

function resolveExecutableCandidates(
  command: string,
  args: readonly string[],
  options: {
    readonly commandResolver?: CodexCliCommandResolver;
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

function addArgsAfterExec(
  args: readonly string[] | undefined,
  argsToAdd: readonly string[],
): readonly string[] | undefined {
  if (args === undefined) return undefined;
  const execIndex = args.indexOf('exec');
  if (execIndex === -1) return [...args, ...argsToAdd];

  return [
    ...args.slice(0, execIndex + 1),
    ...argsToAdd,
    ...args.slice(execIndex + 1),
  ];
}

interface CodexCliStreamState {
  accumulatedContent: string;
  emittedContent: boolean;
  usage: ModelStreamChunk['usage'];
  finalResult: AgentCliRunResult | undefined;
}

interface ParsedCodexCliStreamLine {
  readonly content: string;
  readonly usage?: ModelStreamChunk['usage'];
}

class CodexCliJsonStreamParser {
  private lineBuffer = '';
  private readonly snapshots = new Map<string, string>();

  push(chunk: string): ParsedCodexCliStreamLine[] {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop() ?? '';
    return lines.flatMap((line) => this.parseLine(line));
  }

  finish(): ParsedCodexCliStreamLine[] {
    const line = this.lineBuffer;
    this.lineBuffer = '';
    return line.trim().length > 0 ? this.parseLine(line) : [];
  }

  private parseLine(line: string): ParsedCodexCliStreamLine[] {
    const trimmed = line.trim();
    if (trimmed.length === 0) return [];

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return [];
    }

    const content = extractCodexCliContentDelta(event, this.snapshots);
    const usage = extractCodexCliUsage(event);
    return [{ content, ...(usage !== undefined ? { usage } : {}) }];
  }
}

function extractCodexCliContentDelta(
  event: unknown,
  snapshots: Map<string, string>,
): string {
  if (!isRecord(event)) return '';

  const type = asString(event.type)?.toLowerCase() ?? '';
  if (isCodexCliReasoningEvent(type, event)) return '';

  const item = isRecord(event.item) ? event.item : undefined;
  if (item && isCodexCliAssistantItem(item)) {
    const text = asString(item.text) ?? asString(item.content) ?? '';
    const key = asString(item.id) ?? `item:${type}`;
    return deltaFromSnapshot(snapshots, key, text);
  }

  const message = isRecord(event.message) ? event.message : undefined;
  if (message && isCodexCliAssistantMessage(message, type)) {
    const text = asString(message.text) ?? asString(message.content) ?? '';
    const key = asString(message.id) ?? `message:${type}`;
    return deltaFromSnapshot(snapshots, key, text);
  }

  if (
    type.includes('delta') &&
    (isCodexCliKnownAssistantTextType(type) || hasAssistantRole(event))
  ) {
    return firstString(
      event.delta,
      isRecord(event.delta) ? event.delta.text : undefined,
      isRecord(event.delta) ? event.delta.content : undefined,
      event.text,
      event.content,
    ) ?? '';
  }

  if (type === 'agent_message' || type === 'assistant_message') {
    return firstString(event.text, event.content, event.message) ?? '';
  }

  if (type === 'message' && hasAssistantRole(event)) {
    return firstString(event.text, event.content, event.message) ?? '';
  }

  return '';
}

function extractCodexCliUsage(event: unknown): ModelStreamChunk['usage'] | undefined {
  if (!isRecord(event)) return undefined;
  const source = firstRecord(
    event.usage,
    event.token_usage,
    event.tokenUsage,
    isRecord(event.metrics) ? event.metrics.usage : undefined,
  );
  if (!source) return undefined;

  const inputTokens = firstNumber(
    source.inputTokens,
    source.input_tokens,
    source.promptTokens,
    source.prompt_tokens,
  );
  const outputTokens = firstNumber(
    source.outputTokens,
    source.output_tokens,
    source.completionTokens,
    source.completion_tokens,
  );

  return inputTokens === undefined && outputTokens === undefined
    ? undefined
    : { inputTokens, outputTokens };
}

function isCodexCliAssistantItem(item: Record<string, unknown>): boolean {
  if (hasNonAssistantRole(item)) return false;
  const itemType = asString(item.type)?.toLowerCase() ?? '';
  return isCodexCliKnownAssistantTextType(itemType) || hasAssistantRole(item);
}

function isCodexCliAssistantMessage(
  message: Record<string, unknown>,
  eventType: string,
): boolean {
  const role = asString(message.role)?.toLowerCase();
  if (role !== undefined) return role === 'assistant';
  const messageType = asString(message.type)?.toLowerCase() ?? eventType;
  return isCodexCliKnownAssistantTextType(messageType);
}

function isCodexCliKnownAssistantTextType(type: string): boolean {
  if (type.includes('reasoning') || type.includes('thinking')) return false;
  return type.includes('assistant') ||
    type.includes('agent_message') ||
    type.includes('output_text');
}

function hasAssistantRole(record: Record<string, unknown>): boolean {
  return asString(record.role)?.toLowerCase() === 'assistant';
}

function hasNonAssistantRole(record: Record<string, unknown>): boolean {
  const role = asString(record.role)?.toLowerCase();
  return role !== undefined && role !== 'assistant';
}

function isCodexCliReasoningEvent(type: string, event: Record<string, unknown>): boolean {
  if (type.includes('reasoning') || type.includes('thinking')) return true;
  const item = isRecord(event.item) ? event.item : undefined;
  const itemType = asString(item?.type)?.toLowerCase() ?? '';
  return itemType.includes('reasoning') || itemType.includes('thinking');
}

function deltaFromSnapshot(
  snapshots: Map<string, string>,
  key: string,
  text: string,
): string {
  const previous = snapshots.get(key) ?? '';
  snapshots.set(key, text);
  if (text.length === 0 || text === previous) return '';
  return text.startsWith(previous) ? text.slice(previous.length) : text;
}

function firstString(...values: readonly unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string');
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function firstRecord(...values: readonly unknown[]): Record<string, unknown> | undefined {
  return values.find(isRecord);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clearCodexCliFinalResult(state: CodexCliStreamState): void {
  state.finalResult = undefined;
}

function getCodexCliFinalResult(state: CodexCliStreamState): AgentCliRunResult | undefined {
  return state.finalResult;
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

      void runCodexCliProcessRaw(invocation, runnerOptions, options, (event) => {
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

function runCodexCliProcessRaw(
  invocation: AgentCliInvocation,
  runnerOptions: AgentCliRunnerOptions | undefined,
  options: CodexCliProcessRunnerOptions,
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
    let child;
    try {
      const env = buildProcessEnv(invocation.command.env, runnerOptions, options);
      child = spawn(resolveSpawnExecutable(invocation.command.executable, {
        commandResolver: options.commandResolver,
        env,
        platform: options.platform,
      }), [...(invocation.command.args ?? [])], {
        cwd: invocation.command.cwd,
        env,
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
      onTranscriptEvent?.({ stream: 'stdout', text: chunk, timestamp: new Date().toISOString() });
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      onTranscriptEvent?.({ stream: 'stderr', text: chunk, timestamp: new Date().toISOString() });
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

function resolveSpawnExecutable(
  executable: string,
  options: {
    readonly commandResolver?: CodexCliCommandResolver;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly platform?: NodeJS.Platform;
  },
): string {
  return resolveCodexCliExecutable(executable, options);
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

function isIgnoreUserConfigUnsupported(
  failure: AgentCliFailure | undefined,
  stderr?: string,
  stdout?: string,
): boolean {
  const text = [failure?.message, stderr, stdout]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .toLowerCase();

  if (!text.includes(CODEX_CLI_IGNORE_USER_CONFIG_ARG)) return false;

  return [
    'unexpected argument',
    'unknown option',
    'unknown argument',
    'unrecognized option',
    'unrecognized argument',
    'unsupported option',
    'unsupported argument',
  ].some((marker) => text.includes(marker));
}

function isServiceTierDefaultUnsupported(
  failure: AgentCliFailure | undefined,
  stderr?: string,
  stdout?: string,
): boolean {
  const text = [failure?.message, stderr, stdout]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .toLowerCase();

  return text.includes('service_tier') &&
    text.includes('unknown variant default') &&
    text.includes('expected fast or flex');
}

function createServiceTierDefaultError(
  failure: AgentCliFailure | undefined,
  stderr?: string,
  stdout?: string,
): NousError {
  return new NousError(
    'Codex CLI loaded config.toml but rejected service_tier = "default"; this Codex CLI expects fast or flex. Update Codex CLI or change service_tier to fast/flex in Codex config.',
    failure?.kind === 'auth' ? 'PROVIDER_ERROR' : 'PROVIDER_UNAVAILABLE',
    {
      provider: 'codex-cli',
      failureKind: failure?.kind,
      exitCode: failure?.exitCode,
      signal: failure?.signal,
      timedOut: failure?.timedOut,
      stderr,
      stdout,
    },
  );
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
