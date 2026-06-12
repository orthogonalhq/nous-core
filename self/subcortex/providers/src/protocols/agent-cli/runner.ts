import {
  normalizeAgentCliRunResult,
  type AgentCliInvocation,
  type AgentCliRawResult,
  type AgentCliRunResult,
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
}

export type FakeAgentCliRunnerResult =
  | AgentCliRawResult
  | ((invocation: AgentCliInvocation) => AgentCliRawResult | Promise<AgentCliRawResult>);

export interface FakeAgentCliRunner extends AgentCliRunner {
  readonly policy: AgentCliRunnerPolicy;
  readonly invocations: readonly AgentCliInvocation[];
  readonly calls: readonly FakeAgentCliRunnerCall[];
}

export interface FakeAgentCliRunnerCall {
  readonly invocation: AgentCliInvocation;
  readonly options?: AgentCliRunnerOptions;
}

export function createFakeAgentCliRunner(
  results: readonly FakeAgentCliRunnerResult[] = [{ exitCode: 0 }],
): FakeAgentCliRunner {
  const invocations: AgentCliInvocation[] = [];
  const calls: FakeAgentCliRunnerCall[] = [];
  let nextResultIndex = 0;

  return {
    policy: AGENT_CLI_RUNNER_POLICY,
    get invocations() {
      return invocations;
    },
    get calls() {
      return calls;
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
  };
}
