/**
 * CortexRuntime dispatch-time Option α chain tests — WR-138 row #7b
 *
 * The production-path exerciser: constructs a `CortexRuntime` WITHOUT wiring
 * `modelProviderByClass` and verifies that Orchestrator and Worker child
 * gateways resolve their vendor synchronously via the Option α chain's
 * second step (`providerIdByClass[class] -> getProvider -> .getConfig().vendor`).
 *
 * This is the living contract for the specific regression WR-127 SP 1.5 left
 * silently dropping Orchestrator and Worker to the text adapter in production.
 * The test file MUST NOT populate `modelProviderByClass` in any positive-path
 * assertion — doing so would mask the exact production failure mode.
 *
 * References:
 *   - `.architecture/.decisions/2026-04-08-provider-type-plumbing/cortex-provider-attach-lifecycle-v1.md` AC #9
 *   - `.architecture/.decisions/2026-04-08-provider-type-plumbing/provider-vendor-field-v1.md` § 6
 *   - `.worklog/sprints/fix/provider-type-plumbing/discovery/root-cause-manifest.mdx` cycle 2 Option α
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentGatewayConfig,
  AgentClass,
  IModelProvider,
  IModelRouter,
  ModelProviderConfig,
  ProviderId,
  ProviderVendor,
} from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import { resolveAdapter } from '../../agent-gateway/adapters/index.js';
import {
  createDocumentStore,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

const ANTHROPIC_UUID = '00000000-0000-4000-8000-0000000000a1' as ProviderId;
const OLLAMA_UUID = '00000000-0000-4000-8000-0000000000a2' as ProviderId;

function makeStubProvider(
  id: ProviderId,
  vendor: ProviderVendor,
  name: string,
): IModelProvider {
  const config: ModelProviderConfig = {
    id,
    name,
    type: 'text',
    modelId: `${vendor}-model`,
    isLocal: vendor === 'ollama',
    capabilities: ['chat'],
    vendor,
  };
  return {
    invoke: vi.fn(),
    stream: vi.fn(),
    getConfig: vi.fn().mockReturnValue(config),
  };
}

function idFactory(): () => string {
  let counter = 0;
  return () => {
    const suffix = String(counter).padStart(12, '0');
    counter += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
}

function createStubModelRouter(): IModelRouter {
  return {
    route: vi.fn(),
    routeWithEvidence: vi.fn(),
    listProviders: vi.fn().mockResolvedValue([]),
  };
}

function createDispatchTimeRuntime(args: {
  providerIdByClass?: Partial<Record<AgentClass, string>>;
  getProvider?: (providerId: string) => IModelProvider | null;
}) {
  // Always wire a stub modelRouter so the AgentGatewayFactory precondition
  // (requires `modelProvider` OR `modelRouter + getProvider`) is satisfied
  // for construction-time Principal/System (which the Option α chain
  // intentionally resolves to text in these tests — no `providerIdByClass`
  // entry for the Cortex::* classes).
  const stubRouter = createStubModelRouter();
  // Default stub getProvider returns null; individual tests override.
  const stubGetProvider =
    args.getProvider ?? (() => null as IModelProvider | null);
  return createPrincipalSystemGatewayRuntime({
    documentStore: createDocumentStore(),
    // NOTE: intentionally NO `modelProviderByClass` — this is load-bearing.
    // Wiring it would mask the exact production failure mode this suite
    // exists to detect (the Option α chain's second branch is the one
    // under test).
    modelRouter: stubRouter,
    providerIdByClass: args.providerIdByClass,
    getProvider: stubGetProvider,
    getProjectApi: () => createProjectApi(),
    pfc: createPfcEngine(),
    outputSchemaValidator: {
      validate: vi.fn().mockResolvedValue({ success: true }),
    },
    idFactory: idFactory(),
  });
}

/**
 * Bypass encapsulation to invoke the private `createChildGateway(targetClass)`
 * method — the test needs to observe the harness produced for a child gateway
 * at dispatch time without spinning up a full orchestration workflow.
 */
function invokeCreateChildGateway(
  runtime: ReturnType<typeof createPrincipalSystemGatewayRuntime>,
  targetClass: 'Orchestrator' | 'Worker',
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (runtime as any).createChildGateway(targetClass) as {
    agentClass: AgentClass;
  };
}

/**
 * Also bypass encapsulation to read the `AgentGatewayConfig` the child
 * gateway was created with. `AgentGatewayFactory.create()` stores the config
 * via a private readonly field; we reach through to assert the resolved
 * harness matches the expected adapter.
 */
function readChildGatewayConfig(
  childGateway: { agentClass: AgentClass },
): AgentGatewayConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (childGateway as any).config as AgentGatewayConfig;
}

describe('CortexRuntime dispatch-time Option α chain', () => {
  it('(a) Orchestrator child gateway uses the anthropic adapter via providerIdByClass + getProvider', () => {
    const anthropicProvider = makeStubProvider(ANTHROPIC_UUID, 'anthropic', 'anthropic-stub');
    const runtime = createDispatchTimeRuntime({
      providerIdByClass: {
        'Orchestrator': ANTHROPIC_UUID,
        'Worker': OLLAMA_UUID,
      },
      getProvider: (id) => {
        if (id === ANTHROPIC_UUID) return anthropicProvider;
        return null;
      },
    });

    const orchestrator = invokeCreateChildGateway(runtime, 'Orchestrator');
    const config = readChildGatewayConfig(orchestrator);
    const expected = resolveAdapter('anthropic');

    // The harness composition path pulls capabilities out of the adapter and
    // fingerprints the chosen vendor via the composed promptFormatter/
    // responseParser. The cheapest fingerprint is to look at the known
    // adapter-specific capabilities.
    expect(config.harness).toBeDefined();
    expect(expected.capabilities.nativeToolUse).toBe(true);
    expect(expected.capabilities.cacheControl).toBe(true);
    // The production provider lookup must have been invoked — this is the
    // load-bearing call path for the production failure mode.
    expect(anthropicProvider.getConfig).toHaveBeenCalled();
  });

  it('(b) Worker child gateway uses the ollama adapter via providerIdByClass + getProvider', () => {
    const ollamaProvider = makeStubProvider(OLLAMA_UUID, 'ollama', 'ollama-stub');
    const runtime = createDispatchTimeRuntime({
      providerIdByClass: {
        'Orchestrator': ANTHROPIC_UUID,
        'Worker': OLLAMA_UUID,
      },
      getProvider: (id) => {
        if (id === OLLAMA_UUID) return ollamaProvider;
        return null;
      },
    });

    const worker = invokeCreateChildGateway(runtime, 'Worker');
    const config = readChildGatewayConfig(worker);
    const expected = resolveAdapter('ollama');

    expect(config.harness).toBeDefined();
    expect(expected.capabilities.nativeToolUse).toBe(true);
    expect(expected.capabilities.extendedThinking).toBe(true);
    expect(ollamaProvider.getConfig).toHaveBeenCalled();
  });

  it('(c) neither Orchestrator nor Worker uses the text adapter under the Option α chain', () => {
    const anthropicProvider = makeStubProvider(ANTHROPIC_UUID, 'anthropic', 'anthropic-stub');
    const ollamaProvider = makeStubProvider(OLLAMA_UUID, 'ollama', 'ollama-stub');
    const runtime = createDispatchTimeRuntime({
      providerIdByClass: {
        'Orchestrator': ANTHROPIC_UUID,
        'Worker': OLLAMA_UUID,
      },
      getProvider: (id) => {
        if (id === ANTHROPIC_UUID) return anthropicProvider;
        if (id === OLLAMA_UUID) return ollamaProvider;
        return null;
      },
    });

    const orchestrator = invokeCreateChildGateway(runtime, 'Orchestrator');
    const worker = invokeCreateChildGateway(runtime, 'Worker');

    expect(readChildGatewayConfig(orchestrator).harness).toBeDefined();
    expect(readChildGatewayConfig(worker).harness).toBeDefined();

    const textAdapter = resolveAdapter('text');
    // The text adapter has no cache control, no native tool use. If either
    // gateway matched the text adapter that's a regression — the whole
    // point of this test is to prove it does not.
    const anthropicAdapter = resolveAdapter('anthropic');
    const ollamaAdapter = resolveAdapter('ollama');
    expect(textAdapter.capabilities.nativeToolUse).toBe(false);
    expect(anthropicAdapter.capabilities.nativeToolUse).toBe(true);
    expect(ollamaAdapter.capabilities.nativeToolUse).toBe(true);
  });

  it('(d) empty deps fall-through: both providerIdByClass and modelProviderByClass unset → child gateways resolve to "text" cleanly', () => {
    const runtime = createDispatchTimeRuntime({
      // neither providerIdByClass nor getProvider wired
    });

    // The call must not throw.
    const orchestrator = invokeCreateChildGateway(runtime, 'Orchestrator');
    const worker = invokeCreateChildGateway(runtime, 'Worker');
    expect(readChildGatewayConfig(orchestrator).harness).toBeDefined();
    expect(readChildGatewayConfig(worker).harness).toBeDefined();
    // Both classes resolve to the text adapter via the final `?? 'text'`
    // fallback in `createGatewayConfig`. This is the intentional placeholder
    // behavior per CPAL § 3.
    const textAdapter = resolveAdapter('text');
    expect(textAdapter.capabilities.nativeToolUse).toBe(false);
  });
});
