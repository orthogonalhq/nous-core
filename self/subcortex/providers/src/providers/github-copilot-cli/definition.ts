import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';

export const GITHUB_COPILOT_CLI_DEFAULT_TIMEOUT_MS = 60_000;
export const GITHUB_COPILOT_CLI_MAX_TIMEOUT_MS = 300_000;
export const GITHUB_COPILOT_CLI_DEFAULT_ENDPOINT = 'http://localhost';
export const GITHUB_COPILOT_CLI_DEFAULT_MODEL_ID = 'github-copilot-cli/default';

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
      defaultArgs: ['copilot', 'suggest'],
    },

    install: {
      command: 'gh extension install github/gh-copilot',
      notes: 'Requires GitHub CLI (gh) to be installed first: https://cli.github.com',
    },

    auth: {
      kind: 'local_session',
      description: 'Run `gh auth login` outside Nous to authenticate',
    },

    headless: {
      supported: true,
      requiredArgs: ['--target', 'shell'],
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

    caveats: [
      'Declared session_bound_command — cannot be assigned to Cortex Chat or Cortex System roles',
      'Set NOUS_GH_BIN or GH_BIN env var to override the gh executable path',
    ],

    targetIssueRefs: ['#280'],
  },
} as const satisfies ProviderDefinitionLeaf;

export const providerDefinition = GITHUB_COPILOT_CLI_PROVIDER_DEFINITION;
