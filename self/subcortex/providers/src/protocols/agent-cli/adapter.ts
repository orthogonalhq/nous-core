export const AGENT_CLI_PROTOCOL_ID = 'agent-cli' as const;

export type AgentCliFailureKind =
  | 'timeout'
  | 'non_zero_exit'
  | 'spawn_error'
  | 'auth'
  | 'install_missing'
  | 'unsupported'
  | 'unknown';

export type AgentCliTranscriptStream = 'stdout' | 'stderr' | 'system';

export interface AgentCliCommand {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface AgentCliCommandDefaults {
  readonly executable: string;
  readonly defaultArgs?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface AgentCliHeadlessDefaults {
  readonly supported: boolean;
  readonly requiredArgs?: readonly string[];
  readonly nonInteractiveEnv?: Readonly<Record<string, string>>;
}

export interface AgentCliTimeoutDefaults {
  readonly defaultMs: number;
  readonly maxMs?: number;
}

export interface AgentCliInvocationDefaults {
  readonly command: AgentCliCommandDefaults;
  readonly headless: AgentCliHeadlessDefaults;
  readonly timeout: AgentCliTimeoutDefaults;
}

export interface AgentCliInvocationOptions {
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentCliInvocation {
  readonly command: AgentCliCommand;
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentCliTranscriptEntry {
  readonly stream: AgentCliTranscriptStream;
  readonly text: string;
  readonly timestamp?: string;
}

export interface AgentCliTranscript {
  readonly entries: readonly AgentCliTranscriptEntry[];
  readonly stdout: string;
  readonly stderr: string;
}

export interface AgentCliStreamTranscriptEvent extends AgentCliTranscriptEntry {
  readonly stream: 'stdout' | 'stderr';
}

export interface AgentCliStreamResultEvent {
  readonly stream: 'system';
  readonly result: AgentCliRunResult;
  readonly timestamp?: string;
}

export type AgentCliStreamEvent =
  | AgentCliStreamTranscriptEvent
  | AgentCliStreamResultEvent;

export interface AgentCliFailure {
  readonly kind: AgentCliFailureKind;
  readonly message: string;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly timedOut?: boolean;
  readonly cause?: unknown;
}

export interface AgentCliRawResult {
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly error?: unknown;
  readonly timedOut?: boolean;
  readonly startedAt?: number;
  readonly endedAt?: number;
}

export interface AgentCliRunResult {
  readonly ok: boolean;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly transcript: AgentCliTranscript;
  readonly failure?: AgentCliFailure;
  readonly durationMs?: number;
}

export interface AgentCliProtocolMetadata {
  readonly protocolId: typeof AGENT_CLI_PROTOCOL_ID;
  readonly command: AgentCliCommand;
  readonly supportsHeadless: boolean;
  readonly supportsTranscript: boolean;
  readonly defaultTimeoutMs: number;
}

export interface AgentCliAdapterInput extends AgentCliInvocationOptions {
  readonly runnerOptions?: import('./runner.js').AgentCliRunnerOptions;
}

export interface AgentCliAdapterOutput extends AgentCliRunResult {
  readonly invocation: AgentCliInvocation;
  readonly result: AgentCliRunResult;
}

export interface AgentCliProviderAdapter {
  readonly metadata: AgentCliProtocolMetadata;
  invoke(
    input: AgentCliAdapterInput,
    runner: import('./runner.js').AgentCliRunner,
  ): Promise<AgentCliAdapterOutput>;
  stream(
    input: AgentCliAdapterInput,
    runner: import('./runner.js').AgentCliRunner,
  ): AsyncIterable<AgentCliStreamEvent>;
}

export interface AgentCliProviderAdapterConfig {
  readonly defaults: AgentCliInvocationDefaults;
  readonly metadata?: Partial<Omit<AgentCliProtocolMetadata, 'protocolId'>>;
}

export function createAgentCliProviderAdapter(
  config: AgentCliProviderAdapterConfig,
): AgentCliProviderAdapter {
  const metadata = createAgentCliProtocolMetadata(config);

  return {
    metadata,
    async invoke(input, runner) {
      const { runnerOptions, ...invocationOptions } = input;
      const invocation = createAgentCliInvocation(config.defaults, invocationOptions);
      const result = await runner.run(invocation, runnerOptions);

      return {
        ...result,
        invocation,
        result,
      };
    },
    async *stream(input, runner) {
      if (typeof runner.stream !== 'function') {
        throw new Error('Agent CLI runner does not support streaming.');
      }

      const { runnerOptions, ...invocationOptions } = input;
      const invocation = createAgentCliInvocation(config.defaults, invocationOptions);
      yield* runner.stream(invocation, runnerOptions);
    },
  };
}

export function createAgentCliTranscript(
  stdout = '',
  stderr = '',
): AgentCliTranscript {
  const entries: AgentCliTranscriptEntry[] = [];
  if (stdout.length > 0) {
    entries.push({ stream: 'stdout', text: stdout });
  }
  if (stderr.length > 0) {
    entries.push({ stream: 'stderr', text: stderr });
  }

  return { entries, stdout, stderr };
}

export function createAgentCliInvocation(
  defaults: AgentCliInvocationDefaults,
  options: AgentCliInvocationOptions = {},
): AgentCliInvocation {
  const args = [
    ...(defaults.command.defaultArgs ?? []),
    ...(defaults.headless.requiredArgs ?? []),
    ...(options.args ?? []),
  ];
  const env = mergeEnv(
    defaults.command.env,
    defaults.headless.nonInteractiveEnv,
    options.env,
  );

  return {
    command: {
      executable: defaults.command.executable,
      ...(args.length > 0 ? { args } : {}),
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    },
    ...(options.input !== undefined ? { input: options.input } : {}),
    timeoutMs: normalizeInvocationTimeout(options.timeoutMs, defaults.timeout),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

export function normalizeAgentCliFailure(raw: AgentCliRawResult): AgentCliFailure | undefined {
  if (raw.timedOut) {
    return {
      kind: 'timeout',
      message: 'Agent CLI invocation timed out.',
      timedOut: true,
      exitCode: normalizeExitCode(raw.exitCode),
      signal: normalizeSignal(raw.signal),
      cause: raw.error,
    };
  }

  if (raw.error !== undefined) {
    return {
      kind: 'spawn_error',
      message: errorMessage(raw.error),
      exitCode: normalizeExitCode(raw.exitCode),
      signal: normalizeSignal(raw.signal),
      cause: raw.error,
    };
  }

  const exitCode = normalizeExitCode(raw.exitCode);
  if (exitCode !== undefined && exitCode !== 0) {
    return {
      kind: 'non_zero_exit',
      message: `Agent CLI exited with code ${exitCode}.`,
      exitCode,
      signal: normalizeSignal(raw.signal),
    };
  }

  const signal = normalizeSignal(raw.signal);
  if (signal !== undefined) {
    return {
      kind: 'non_zero_exit',
      message: `Agent CLI exited from signal ${signal}.`,
      signal,
    };
  }

  return undefined;
}

export function normalizeAgentCliRunResult(raw: AgentCliRawResult): AgentCliRunResult {
  const stdout = raw.stdout ?? '';
  const stderr = raw.stderr ?? '';
  const failure = normalizeAgentCliFailure(raw);
  const exitCode = normalizeExitCode(raw.exitCode);
  const signal = normalizeSignal(raw.signal);
  const durationMs = raw.startedAt !== undefined && raw.endedAt !== undefined
    ? Math.max(0, raw.endedAt - raw.startedAt)
    : undefined;

  return {
    ok: failure === undefined,
    exitCode,
    signal,
    stdout,
    stderr,
    transcript: createAgentCliTranscript(stdout, stderr),
    failure,
    durationMs,
  };
}

function normalizeExitCode(exitCode: number | null | undefined): number | undefined {
  return typeof exitCode === 'number' ? exitCode : undefined;
}

function normalizeSignal(signal: string | null | undefined): string | undefined {
  return typeof signal === 'string' && signal.length > 0 ? signal : undefined;
}

function normalizeInvocationTimeout(
  requested: number | undefined,
  defaults: AgentCliTimeoutDefaults,
): number {
  const timeoutMs = requested ?? defaults.defaultMs;
  const positiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.trunc(timeoutMs)
    : defaults.defaultMs;

  return defaults.maxMs === undefined
    ? positiveTimeoutMs
    : Math.min(positiveTimeoutMs, defaults.maxMs);
}

function mergeEnv(
  ...records: readonly (Readonly<Record<string, string>> | undefined)[]
): Readonly<Record<string, string>> {
  return records.reduce<Record<string, string>>((merged, record) => {
    if (record !== undefined) {
      Object.assign(merged, record);
    }
    return merged;
  }, {});
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createAgentCliProtocolMetadata(
  config: AgentCliProviderAdapterConfig,
): AgentCliProtocolMetadata {
  const metadata = config.metadata ?? {};
  const command = metadata.command ?? {
    executable: config.defaults.command.executable,
    ...(config.defaults.command.defaultArgs !== undefined
      ? { args: config.defaults.command.defaultArgs }
      : {}),
    ...(config.defaults.command.env !== undefined
      ? { env: config.defaults.command.env }
      : {}),
  };

  return {
    command,
    supportsHeadless: config.defaults.headless.supported,
    supportsTranscript: true,
    defaultTimeoutMs: config.defaults.timeout.defaultMs,
    ...metadata,
    protocolId: AGENT_CLI_PROTOCOL_ID,
  };
}
