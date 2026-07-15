import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';
import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const QWEN_CODE_DEFAULT_ENDPOINT = 'http://localhost';
export const QWEN_CODE_DEFAULT_MODEL_ID = 'qwen-code/default';
export const QWEN_CODE_DEFAULT_TIMEOUT_MS = 300_000;
export const QWEN_CODE_MAX_TIMEOUT_MS = 1_800_000;

export const QWEN_CODE_PROVIDER_DEFINITION = {
  vendorKey: 'qwen-code',
  displayName: 'Qwen Code',
  providerType: 'text',
  providerClass: 'local_text',
  protocol: AGENT_CLI_PROTOCOL_ID,
  adapterKey: 'qwen-code',
  defaultEndpoint: QWEN_CODE_DEFAULT_ENDPOINT,
  defaultModelId: QWEN_CODE_DEFAULT_MODEL_ID,
  auth: {
    required: false,
    purpose: 'api_key',
  },
  capabilities: {
    streaming: true,
    cacheControl: false,
    extendedThinking: false,
    nativeToolUse: false,
    healthCheck: false,
  },
  executionCapabilityProfile: 'one_shot_command',
  isLocal: true,
  agentCli: {
    command: {
      executable: 'qwen',
      defaultArgs: [],
    },
    install: {
      command: 'npm install -g @qwen-code/qwen-code@latest',
      packageName: '@qwen-code/qwen-code',
      versionCommand: 'qwen --version',
      minimumVersion: '0.0.1',
      notes: 'Qwen Code requires Node.js 22+ and must be installed and authenticated locally before use; run `qwen` once and use /auth, or export OPENAI_API_KEY/OPENAI_BASE_URL/OPENAI_MODEL.',
    },
    auth: {
      kind: 'local_session',
      description: 'Uses the local Qwen Code login session; authenticate via `qwen` then /auth, or set OPENAI_API_KEY/OPENAI_BASE_URL/OPENAI_MODEL outside Nous.',
    },
    headless: {
      supported: true,
      requiredArgs: [],
      nonInteractiveEnv: {
        NO_COLOR: '1',
      },
    },
    transcript: {
      supported: true,
      streams: ['stdout', 'stderr'],
      format: 'text',
    },
    timeout: {
      defaultMs: QWEN_CODE_DEFAULT_TIMEOUT_MS,
      maxMs: QWEN_CODE_MAX_TIMEOUT_MS,
    },
    failureBehavior: {
      timeoutKind: 'timeout',
      nonZeroExitKind: 'non_zero_exit',
      spawnErrorKind: 'spawn_error',
    },
    caveats: [
      'Transient and batch execution use the documented one-shot `qwen -p "<prompt>"` command path. Qwen Code declares `one_shot_command`, not `persistent_process`, so Cortex persistent-chat surfaces must reject it through adapter capability guardrails rather than pretending it can provide a strict long-lived chat process.',
      'Each invocation spawns a fresh `qwen` process with no carried session state; the provider does not retain context across requests.',
      'Live process execution shells out to the local Qwen Code CLI; tests must inject a fake runner.',
      'The catalog default is conservative and does not auto-approve Qwen Code tool use; pass explicit provider runner args only for trusted opt-in profiles.',
      'The rendered prompt is passed to `qwen -p` for non-interactive one-shot execution; the live runner does not rely on bare stdin to enter headless mode.',
      'The live runner uses an allowlisted environment by default for Qwen/OpenAI/DashScope auth, proxy/cert configuration, PATH, and local user config locations; full parent-environment inheritance requires an explicit runner environment policy.',
      'Set NOUS_QWEN_CODE_BIN, or QWEN_CODE_BIN, when another qwen executable shadows the desired system Qwen Code CLI on PATH; without an override the live runner prefers non-node_modules/.bin candidates when resolving qwen.',
      'The endpoint is a local placeholder because provider definitions currently require URLs.',
      'Set a concrete modelId to pass `--model`; the default model uses the Qwen Code profile/config.',
    ],
    targetIssueRefs: ['#296'],
  },
} as const satisfies ProviderDefinitionLeaf;

export {
  QWEN_CODE_PROVIDER_DEFINITION as providerDefinition,
};
