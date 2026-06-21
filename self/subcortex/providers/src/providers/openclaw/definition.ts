import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';
import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const OPENCLAW_DEFAULT_ENDPOINT = 'http://localhost';
export const OPENCLAW_DEFAULT_MODEL_ID = 'openclaw/default';
export const OPENCLAW_DEFAULT_TIMEOUT_MS = 300_000;
export const OPENCLAW_MAX_TIMEOUT_MS = 1_800_000;

export const OPENCLAW_PROVIDER_DEFINITION = {
  vendorKey: 'openclaw',
  displayName: 'OpenClaw',
  providerType: 'text',
  providerClass: 'local_text',
  protocol: AGENT_CLI_PROTOCOL_ID,
  adapterKey: 'openclaw',
  defaultEndpoint: OPENCLAW_DEFAULT_ENDPOINT,
  defaultModelId: OPENCLAW_DEFAULT_MODEL_ID,
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
  executionCapabilityProfile: 'session_bound_command',
  isLocal: true,
  agentCli: {
    command: {
      executable: 'openclaw',
      defaultArgs: ['run', '--headless', '--no-color'],
    },
    install: {
      command: 'npm install -g openclaw',
      packageName: 'openclaw',
      versionCommand: 'openclaw --version',
      notes: 'The OpenClaw CLI must be installed and authenticated locally before use.',
    },
    auth: {
      kind: 'local_session',
      description: 'Uses the local OpenClaw CLI session; run `openclaw login` outside Nous.',
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
      defaultMs: OPENCLAW_DEFAULT_TIMEOUT_MS,
      maxMs: OPENCLAW_MAX_TIMEOUT_MS,
    },
    failureBehavior: {
      timeoutKind: 'timeout',
      nonZeroExitKind: 'non_zero_exit',
      spawnErrorKind: 'spawn_error',
    },
    caveats: [
      'Transient and batch execution use the one-shot `openclaw run --headless` command path. OpenClaw declares `session_bound_command`, not `persistent_process`, so Cortex persistent-chat surfaces must reject it through adapter capability guardrails rather than pretending it can provide a strict long-lived chat process.',
      'Live process execution shells out to the local OpenClaw CLI; tests must inject a fake runner via createFakeAgentCliRunner.',
      'The prompt is delivered to the CLI over stdin; the final assistant response is read back from stdout (transcript format `text`).',
      'Set NOUS_OPENCLAW_CLI_BIN, or OPENCLAW_CLI_BIN, when another openclaw executable shadows the desired system OpenClaw CLI on PATH.',
      'The endpoint is a local placeholder because provider definitions currently require URLs.',
      'Set a concrete modelId to pass `--model`; the default model uses the OpenClaw CLI profile/config.',
    ],
    targetIssueRefs: ['#299'],
  },
} as const satisfies ProviderDefinitionLeaf;

export {
  OPENCLAW_PROVIDER_DEFINITION as providerDefinition,
};
