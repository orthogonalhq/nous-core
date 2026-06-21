import {
  normalizeAgentCliRunResult,
  type AgentCliInvocation,
  type AgentCliRawResult,
  type AgentCliRunResult,
  type AgentCliStreamEvent,
} from './adapter.js';

export const AGENT_CLI_RUNNER_POLICY = {
  liveProcessRunnerIncluded: false,
  runnerInjectionRequired: true,
  fixtureRunnerFactory: 'createFakeAgentCliRunner',
} as const;

export type AgentCliRunnerPolicy = typeof AGENT_CLI_RUNNER_POLICY;

export type AgentCliEnvironmentMergeStrategy = 'none' | 'allowlist' | 'explicit';

export interface AgentCliEnvironmentPolicy {
  readonly mergeStrategy: AgentCliEnvironmentMergeStrategy;
  readonly allowlist?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface AgentCliAbortSignal {
  readonly aborted: boolean;
}

export interface AgentCliRunnerOptions {
  readonly signal?: AgentCliAbortSignal;
  readonly environmentPolicy?: AgentCliEnvironmentPolicy;
}

export interface AgentCliRunner {
  run(
    invocation: AgentCliInvocation,
    options?: AgentCliRunnerOptions,
  ): Promise<AgentCliRunResult>;
  stream?(
    invocation: AgentCliInvocation,
    options?: AgentCliRunnerOptions,
  ): AsyncIterable<AgentCliStreamEvent>;
}

export type FakeAgentCliRunnerResult =
  | AgentCliRawResult
  | ((invocation: AgentCliInvocation) => AgentCliRawResult | Promise<AgentCliRawResult>);

export type FakeAgentCliRunnerStreamResult =
  | readonly AgentCliStreamEvent[]
  | ((invocation: AgentCliInvocation) => readonly AgentCliStreamEvent[] | Promise<readonly AgentCliStreamEvent[]>);

export interface FakeAgentCliRunner extends AgentCliRunner {
  readonly policy: AgentCliRunnerPolicy;
  readonly invocations: readonly AgentCliInvocation[];
  readonly calls: readonly FakeAgentCliRunnerCall[];
  readonly streamInvocations: readonly AgentCliInvocation[];
  readonly streamCalls: readonly FakeAgentCliRunnerCall[];
}

export interface FakeAgentCliRunnerCall {
  readonly invocation: AgentCliInvocation;
  readonly options?: AgentCliRunnerOptions;
}

export function createFakeAgentCliRunner(
  results: readonly FakeAgentCliRunnerResult[] = [{ exitCode: 0 }],
  streamResults: readonly FakeAgentCliRunnerStreamResult[] = [],
): FakeAgentCliRunner {
  const invocations: AgentCliInvocation[] = [];
  const calls: FakeAgentCliRunnerCall[] = [];
  const streamInvocations: AgentCliInvocation[] = [];
  const streamCalls: FakeAgentCliRunnerCall[] = [];
  let nextResultIndex = 0;
  let nextStreamResultIndex = 0;

  return {
    policy: AGENT_CLI_RUNNER_POLICY,
    get invocations() {
      return invocations;
    },
    get calls() {
      return calls;
    },
    get streamInvocations() {
      return streamInvocations;
    },
    get streamCalls() {
      return streamCalls;
    },
    async run(invocation, options) {
      invocations.push(invocation);
      calls.push(options === undefined ? { invocation } : { invocation, options });
      const nextResult = results[nextResultIndex] ?? { exitCode: 0 };
      nextResultIndex += 1;

      const rawResult = typeof nextResult === 'function'
        ? await nextResult(invocation)
        : nextResult;

      return normalizeAgentCliRunResult(rawResult);
    },
    async *stream(invocation, options) {
      streamInvocations.push(invocation);
      streamCalls.push(options === undefined ? { invocation } : { invocation, options });
      const nextResult = streamResults[nextStreamResultIndex];
      nextStreamResultIndex += 1;

      if (nextResult === undefined) {
        const result = await this.run(invocation, options);
        yield { stream: 'system', result };
        return;
      }

      const events = typeof nextResult === 'function'
        ? await nextResult(invocation)
        : nextResult;

      for (const event of events) {
        yield event;
      }
    },
  };
}
