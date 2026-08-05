/**
 * Amp provider definition — CLI-backed provider leaf.
 *
 * Amp is a coding agent CLI. This leaf uses `ProviderDefinitionLeaf` rather than
 * the full `ProviderDefinition` shape: `wellKnownProviderId` is not hand-authored
 * here; it is derived centrally from `vendorKey` via `provider-identity.ts` so the
 * leaf stays semantic-only.
 *
 * `executionCapabilityProfile: 'one_shot_command'` declares that this integration
 * spawns a fresh `amp` process for every invocation via `-x` and does not retain or
 * resume a thread identifier across calls. Amp itself supports session continuity
 * through `amp threads continue [threadId] -x`, but that path is not used here:
 * Nous owns the canonical conversation history and supplies the relevant context
 * with each request, so from Nous's perspective each Amp invocation is a discrete,
 * stateless command execution.
 */
import type { ProviderDefinition, ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';

export const AMP_DEFAULT_TIMEOUT_MS = 120_000;
export const AMP_MAX_TIMEOUT_MS = 300_000;

/**
 * Amp leaf — the contributor-authored portion of the provider definition.
 * Satisfies `ProviderDefinitionLeaf` (all fields except `wellKnownProviderId`).
 * No HTTP endpoint or default model ID: Amp is a local CLI tool.
 */
const AMP_LEAF = {
  vendorKey: 'amp',
  displayName: 'Amp',
  protocol: AGENT_CLI_PROTOCOL_ID,
  adapterKey: 'amp',
  executionCapabilityProfile: 'one_shot_command',
  providerType: 'text',
  providerClass: 'local_text',
  isLocal: true,
  /** No HTTP endpoint — Amp is a local CLI process. */
  defaultEndpoint: undefined,
  /** Amp manages model selection internally; 'amp' identifies the CLI agent as the model. */
  defaultModelId: 'amp',
  auth: {
    /** No API key required — Amp runs as a local process. */
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
      executable: 'amp',
      defaultArgs: ['-x'],
    },

    auth: {
      kind: 'local_session',
      description: 'Sign in once via `ampcode.com/install` outside Nous; the CLI reuses that session headlessly.',
    },

    headless: {
      supported: true,
      requiredArgs: [],
    },

    transcript: {
      supported: true,
      streams: ['stdout'],
    },

    timeout: {
      defaultMs: AMP_DEFAULT_TIMEOUT_MS,
      maxMs: AMP_MAX_TIMEOUT_MS,
    },

    failureBehavior: {
      timeoutKind: 'timeout',
      nonZeroExitKind: 'non_zero_exit',
      spawnErrorKind: 'spawn_error',
    },

    caveats: [
      'Prompt content is delivered via stdin (not argv) so it is not exposed through process listings or argv-based logging',
      'Abort is honored only before process start; once `amp` is spawned the request runs to completion or timeout',
      'Amp CLI supports resuming prior conversations via `amp threads continue [threadId]`, but this integration does not use that path; each invocation is a fresh, independent process',
    ],

    targetIssueRefs: ['#287'],
  },
} as const satisfies ProviderDefinitionLeaf;

/**
 * Full certified provider definition, hydrated with the stable built-in ID
 * derived from `vendorKey`. Exported as `providerDefinition` so the generator
 * can discover and include it in the `PROVIDER_DEFINITIONS` catalog.
 */
export const providerDefinition = {
  ...AMP_LEAF,
  wellKnownProviderId: deriveBuiltInProviderId(AMP_LEAF.vendorKey),
} as const satisfies ProviderDefinition;