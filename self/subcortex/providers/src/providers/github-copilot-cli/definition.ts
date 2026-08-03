import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';

export const GITHUB_COPILOT_CLI_DEFAULT_TIMEOUT_MS = 60_000;
export const GITHUB_COPILOT_CLI_MAX_TIMEOUT_MS = 300_000;
export const GITHUB_COPILOT_CLI_DEFAULT_ENDPOINT = 'http://localhost';
export const GITHUB_COPILOT_CLI_DEFAULT_MODEL_ID = 'openai/gpt-4o-mini';

export const GITHUB_COPILOT_CLI_PROVIDER_DEFINITION = {
  vendorKey: 'github-copilot-cli',
  displayName: 'GitHub Copilot CLI',
  providerType: 'text',
  providerClass: 'local_text',
  protocol: AGENT_CLI_PROTOCOL_ID,
  adapterKey: 'github-copilot-cli',
  defaultEndpoint: GITHUB_COPILOT_CLI_DEFAULT_ENDPOINT,
  defaultModelId: GITHUB_COPILOT_CLI_DEFAULT_MODEL_ID,
  isLocal: true,
  executionCapabilityProfile: 'session_bound_command',

  auth: {
    required: false,
    purpose: 'api_key',
  },

  capabilities: {
    streaming: false,
    nativeToolUse: false,
    cacheControl: false,
    extendedThinking: false,
    healthCheck: false,
  },

  agentCli: {
    command: {
      executable: 'gh',
      defaultArgs: ['models', 'run'],
    },

    install: {
      command: 'gh extension install https://github.com/github/gh-models',
      notes: 'Requires GitHub CLI (gh) installed and authenticated (`gh auth login`) first: https://cli.github.com. Installs the GitHub Models extension.',
    },

    auth: {
      kind: 'local_session',
      description: 'Run `gh auth login` outside Nous to authenticate',
    },

    headless: {
      supported: true,
      requiredArgs: [],
      nonInteractiveEnv: { NO_COLOR: '1' },
    },

    transcript: {
      supported: true,
      streams: ['stdout'],
    },

    timeout: {
      defaultMs: GITHUB_COPILOT_CLI_DEFAULT_TIMEOUT_MS,
      maxMs: GITHUB_COPILOT_CLI_MAX_TIMEOUT_MS,
    },

    failureBehavior: {
      timeoutKind: 'timeout',
      nonZeroExitKind: 'non_zero_exit',
      spawnErrorKind: 'spawn_error',
    },

    caveats: [
      'Declared session_bound_command — cannot be assigned to Cortex Chat or Cortex System roles',
      'Targets `gh models run <model>` (GitHub Models extension); the legacy `gh copilot suggest --target shell` surface was deprecated 2025-09-25 and stopped producing output 2025-10-25',
      'Prompt content is delivered via stdin (not argv) so it is not exposed through process listings or argv-based logging',
      'Abort is honored only before process start; once `gh` is spawned the request runs to completion or timeout',
    ],

    targetIssueRefs: ['#280'],
  },
} as const satisfies ProviderDefinitionLeaf;

export const providerDefinition = GITHUB_COPILOT_CLI_PROVIDER_DEFINITION;
