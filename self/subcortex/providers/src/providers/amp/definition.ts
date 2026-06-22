/**
 * Amp provider definition — CLI-backed provider leaf.
 *
 * Amp is a session-bound coding agent CLI. This leaf uses `ProviderDefinitionLeaf`
 * rather than the full `ProviderDefinition` shape: `wellKnownProviderId` is not
 * hand-authored here; it is derived centrally from `vendorKey` via
 * `provider-identity.ts` so the leaf stays semantic-only.
 *
 * `executionCapabilityProfile: 'session_bound_command'` declares that Amp can
 * preserve command/session context across invocations but does not expose a
 * strict long-lived process protocol. This profile disqualifies Amp from
 * Cortex persistent-chat roles at selection time while keeping it available
 * for compatible agent roles.
 */
import type { ProviderDefinition, ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';

/** Wire protocol identifier for CLI-backed agent providers. */
export const AGENT_CLI_PROTOCOL_ID = 'agent-cli';

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
  executionCapabilityProfile: 'session_bound_command',
  providerType: 'text',
  providerClass: 'local_text',
  isLocal: true,
  auth: {
    /** No API key required — Amp runs as a local process. */
    required: false,
    purpose: 'api_key',
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
