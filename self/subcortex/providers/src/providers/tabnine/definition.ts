import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';
import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const TABNINE_DEFAULT_ENDPOINT = 'http://localhost';
export const TABNINE_DEFAULT_MODEL_ID = 'tabnine/default';
export const TABNINE_DEFAULT_TIMEOUT_MS = 300_000;
export const TABNINE_MAX_TIMEOUT_MS = 1_800_000;

export const TABNINE_PROVIDER_DEFINITION = {
  vendorKey: 'tabnine',
  displayName: 'Tabnine',
  providerType: 'text',
  providerClass: 'local_text',
  protocol: AGENT_CLI_PROTOCOL_ID,
  adapterKey: 'tabnine',
  defaultEndpoint: TABNINE_DEFAULT_ENDPOINT,
  defaultModelId: TABNINE_DEFAULT_MODEL_ID,
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
      executable: 'tabnine',
      defaultArgs: [],
    },
    install: {
      command:
        'curl -fsSL "https://console.tabnine.com/update/cli/installer.mjs" -o tabnine-installer.mjs && node tabnine-installer.mjs "https://console.tabnine.com"',
      versionCommand: 'tabnine --version',
      minimumVersion: '0.0.1',
      notes: 'Tabnine CLI requires Node.js 22+ and Tabnine Agents enabled for your team; it is installed from the Tabnine host installer script (not npm). The install command targets the Tabnine cloud host (https://console.tabnine.com) by default; self-hosted / dedicated-instance users must substitute their own TABNINE_HOST for https://console.tabnine.com in both the installer URL and the installer argument. Authenticate headlessly by exporting TABNINE_TOKEN (a Personal Access Token) and optionally TABNINE_HOST, or run `tabnine` once interactively to establish a local session.',
    },
    auth: {
      kind: 'api_key',
      envVar: 'TABNINE_TOKEN',
      description: 'Set TABNINE_TOKEN to a Tabnine Personal Access Token for non-interactive use (optionally TABNINE_HOST to select the host); alternatively authenticate once interactively via `tabnine` to store a local session under ~/.tabnine.',
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
      defaultMs: TABNINE_DEFAULT_TIMEOUT_MS,
      maxMs: TABNINE_MAX_TIMEOUT_MS,
    },
    failureBehavior: {
      timeoutKind: 'timeout',
      nonZeroExitKind: 'non_zero_exit',
      spawnErrorKind: 'spawn_error',
    },
    caveats: [
      'Transient and batch execution use the documented one-shot `tabnine -p "<prompt>"` command path. Tabnine declares `one_shot_command`, not `persistent_process`, so Cortex persistent-chat surfaces must reject it through adapter capability guardrails rather than pretending it can provide a strict long-lived chat process.',
      'Each invocation spawns a fresh `tabnine` process with no carried session state; the provider does not retain context across requests.',
      'Live process execution shells out to the local Tabnine CLI; tests must inject a fake runner.',
      'The `-y` (auto-accept / YOLO) flag is intentionally NOT enabled by default because it makes the agent execute tool calls — editing files and running shell commands — without interactive confirmation. Trusted automation can opt into auto-accept separately if the caller supports it; the default headless invocation stays `tabnine -p "<prompt>"`.',
      'Model selection is not a Tabnine CLI flag: the CLI reads the model from `~/.tabnine/agent/settings.json`, so the provider does not pass a `--model` argument and modelId is a catalog placeholder.',
      'Output is captured as plain-text stdout; the CLI `--output-format json` mode is Tabnine-specific rather than a Nous response envelope, so it is not used.',
      'The live runner uses an allowlisted environment by default for Tabnine auth/host (TABNINE_TOKEN, TABNINE_HOST), proxy/cert configuration, PATH, and local user config locations; full parent-environment inheritance requires an explicit runner environment policy.',
      'Set NOUS_TABNINE_BIN, or TABNINE_BIN, when another tabnine executable shadows the desired system Tabnine CLI on PATH; without an override the live runner prefers non-node_modules/.bin candidates when resolving tabnine.',
      'The endpoint is a local placeholder because provider definitions currently require URLs.',
    ],
    targetIssueRefs: ['#300'],
  },
} as const satisfies ProviderDefinitionLeaf;

export {
  TABNINE_PROVIDER_DEFINITION as providerDefinition,
};
