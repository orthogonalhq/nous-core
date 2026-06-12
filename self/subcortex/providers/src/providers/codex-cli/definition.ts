import type { ProviderId } from '@nous/shared';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';
import type { ProviderDefinition } from '../../schemas/provider-definition.js';

export const CODEX_CLI_PROVIDER_ID = '10000000-0000-0000-0000-000000000004' as ProviderId;
export const CODEX_CLI_DEFAULT_ENDPOINT = 'http://localhost';
export const CODEX_CLI_DEFAULT_MODEL_ID = 'codex-cli/default';
export const CODEX_CLI_DEFAULT_TIMEOUT_MS = 300_000;
export const CODEX_CLI_MAX_TIMEOUT_MS = 1_800_000;

export const CODEX_CLI_PROVIDER_DEFINITION = {
  vendorKey: 'codex-cli',
  displayName: 'Codex CLI',
  wellKnownProviderId: CODEX_CLI_PROVIDER_ID,
  providerType: 'text',
  providerClass: 'local_text',
  protocol: AGENT_CLI_PROTOCOL_ID,
  adapterKey: 'codex-cli',
  defaultEndpoint: CODEX_CLI_DEFAULT_ENDPOINT,
  defaultModelId: CODEX_CLI_DEFAULT_MODEL_ID,
  auth: {
    required: false,
    purpose: 'api_key',
  },
  capabilities: {
    streaming: false,
    cacheControl: false,
    extendedThinking: false,
    nativeToolUse: false,
    healthCheck: false,
  },
  isLocal: true,
  agentCli: {
    command: {
      executable: 'codex',
      defaultArgs: ['--ask-for-approval', 'never', 'exec', '--ignore-user-config', '--sandbox', 'read-only', '--color', 'never'],
    },
    install: {
      command: 'npm install -g @openai/codex',
      packageName: '@openai/codex',
      versionCommand: 'codex --version',
      minimumVersion: '0.137.0',
      notes: 'Codex CLI must be installed and authenticated locally before use.',
    },
    auth: {
      kind: 'local_session',
      description: 'Uses the local Codex CLI login session; run `codex login` outside Nous.',
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
      defaultMs: CODEX_CLI_DEFAULT_TIMEOUT_MS,
      maxMs: CODEX_CLI_MAX_TIMEOUT_MS,
    },
    failureBehavior: {
      timeoutKind: 'timeout',
      nonZeroExitKind: 'non_zero_exit',
      spawnErrorKind: 'spawn_error',
    },
    caveats: [
      'Live process execution shells out to the local Codex CLI; tests must inject a fake runner.',
      'Provider output prefers Codex CLI `--output-last-message` so chat receives the final assistant response rather than the execution transcript.',
      'Uses `--ignore-user-config` for deterministic provider execution; Codex auth still uses CODEX_HOME.',
      'Set CODEX_CLI_BIN when another codex executable shadows the desired system Codex CLI on PATH.',
      'The endpoint is a local placeholder because provider definitions currently require URLs.',
      'Set a concrete modelId to pass `--model`; the default model uses the Codex CLI profile/config.',
    ],
    targetIssueRefs: ['#280'],
  },
} as const satisfies ProviderDefinition;

export {
  CODEX_CLI_PROVIDER_DEFINITION as providerDefinition,
};
