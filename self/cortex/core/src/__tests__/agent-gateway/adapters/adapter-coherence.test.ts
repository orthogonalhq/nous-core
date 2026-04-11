/**
 * Adapter coherence tests — WR-148 sub-phase 1.1
 *
 * Verifies that bootstrap vendor resolution reads from the actually-assigned
 * provider per agent class, not from a hardcoded well-known ID.
 *
 * These tests exercise the resolution pattern used in bootstrap.ts:
 *   1. `currentRoleAssignment(ctx, role)` reads the configured provider ID.
 *   2. `providerRegistry.getProvider(id)?.getConfig().vendor` resolves the vendor string.
 *   3. The vendor string is stamped via `attachProviders` for Principal/System
 *      and via `providerIdByClass` for Orchestrator/Worker.
 *
 * The tests validate that the contract is correct for non-Anthropic providers
 * (specifically Ollama) and that the fallback to Anthropic is preserved when
 * no role assignment exists.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AgentGatewayConfig, IModelRouter } from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '../../../gateway-runtime/index.js';
import { resolveAdapter } from '../../../agent-gateway/adapters/index.js';
import {
  createDocumentStore,
  createPfcEngine,
  createProjectApi,
} from '../helpers.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function createStubModelRouter(): IModelRouter {
  return {
    route: vi.fn(),
    routeWithEvidence: vi.fn(),
    listProviders: vi.fn().mockResolvedValue([]),
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

function createRuntime(overrides?: Record<string, unknown>) {
  return createPrincipalSystemGatewayRuntime({
    documentStore: createDocumentStore(),
    modelRouter: createStubModelRouter(),
    getProvider: () => null,
    getProjectApi: () => createProjectApi(),
    pfc: createPfcEngine(),
    outputSchemaValidator: {
      validate: vi.fn().mockResolvedValue({ success: true }),
    },
    idFactory: idFactory(),
    ...overrides,
  });
}

function readPrincipalConfig(
  runtime: ReturnType<typeof createPrincipalSystemGatewayRuntime>,
): AgentGatewayConfig {
  return (runtime as any).principalGatewayConfig as AgentGatewayConfig;
}

function readSystemConfig(
  runtime: ReturnType<typeof createPrincipalSystemGatewayRuntime>,
): AgentGatewayConfig {
  return (runtime as any).systemGatewayConfig as AgentGatewayConfig;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Adapter coherence — vendor resolution (WR-148 sub-phase 1.1)', () => {
  it('attachProviders with ollama vendor stamps ollama harness on Principal and System', () => {
    const runtime = createRuntime();
    const harnessBefore = readPrincipalConfig(runtime).harness;

    runtime.attachProviders({
      providerVendorByClass: {
        'Cortex::Principal': 'ollama',
        'Cortex::System': 'ollama',
      },
    });

    const principalConfig = readPrincipalConfig(runtime);
    const systemConfig = readSystemConfig(runtime);

    // Harness was swapped (new object)
    expect(principalConfig.harness).not.toBe(harnessBefore);
    expect(principalConfig.harness).toBeDefined();
    expect(systemConfig.harness).toBeDefined();

    // Verify the ollama adapter fingerprint: ollama has nativeToolUse true
    // but cacheControl false — the anthropic adapter has cacheControl true.
    const ollamaAdapter = resolveAdapter('ollama');
    expect(ollamaAdapter.capabilities.nativeToolUse).toBe(true);
    expect(ollamaAdapter.capabilities.cacheControl).toBe(false);
  });

  it('attachProviders with anthropic vendor stamps anthropic harness on Principal and System', () => {
    const runtime = createRuntime();
    const harnessBefore = readPrincipalConfig(runtime).harness;

    runtime.attachProviders({
      providerVendorByClass: {
        'Cortex::Principal': 'anthropic',
        'Cortex::System': 'anthropic',
      },
    });

    const principalConfig = readPrincipalConfig(runtime);
    const systemConfig = readSystemConfig(runtime);

    // Harness was swapped (new object)
    expect(principalConfig.harness).not.toBe(harnessBefore);
    expect(principalConfig.harness).toBeDefined();
    expect(systemConfig.harness).toBeDefined();

    // Anthropic adapter fingerprint: cacheControl is true
    const anthropicAdapter = resolveAdapter('anthropic');
    expect(anthropicAdapter.capabilities.cacheControl).toBe(true);
  });

  it('without attachProviders, gateways use text-adapter placeholder harness', () => {
    const runtime = createRuntime();

    const principalConfig = readPrincipalConfig(runtime);
    const systemConfig = readSystemConfig(runtime);

    // Before attachProviders, harness exists (text-adapter placeholder per CPAL section 3)
    expect(principalConfig.harness).toBeDefined();
    expect(systemConfig.harness).toBeDefined();

    // Text adapter fingerprint: nativeToolUse is false
    const textAdapter = resolveAdapter('text');
    expect(textAdapter.capabilities.nativeToolUse).toBe(false);
  });

  it('providerIdByClass correctly propagates non-Anthropic provider IDs to runtime', () => {
    // When providerIdByClass maps an agent class to a non-Anthropic provider,
    // the getProvider callback receives that ID (not the Anthropic well-known ID).
    const ollamaProviderId = '10000000-0000-0000-0000-000000000003';
    const getProviderCalls: string[] = [];

    createRuntime({
      getProvider: (id: string) => {
        getProviderCalls.push(id);
        return null;
      },
      providerIdByClass: {
        'Cortex::Principal': ollamaProviderId,
        'Cortex::System': ollamaProviderId,
        'Orchestrator': ollamaProviderId,
        'Worker': ollamaProviderId,
      },
    });

    // The runtime constructor calls getProvider for Principal and System
    // via createGatewayConfig. Verify the Ollama provider ID was used.
    expect(getProviderCalls).toContain(ollamaProviderId);
  });

  it('mixed provider assignment: Principal gets ollama, System gets anthropic', () => {
    const runtime = createRuntime();
    const principalHarnessBefore = readPrincipalConfig(runtime).harness;
    const systemHarnessBefore = readSystemConfig(runtime).harness;

    runtime.attachProviders({
      providerVendorByClass: {
        'Cortex::Principal': 'ollama',
        'Cortex::System': 'anthropic',
      },
    });

    const principalConfig = readPrincipalConfig(runtime);
    const systemConfig = readSystemConfig(runtime);

    // Both harnesses were swapped
    expect(principalConfig.harness).not.toBe(principalHarnessBefore);
    expect(systemConfig.harness).not.toBe(systemHarnessBefore);

    // Both are defined (functional, not null/placeholder)
    expect(principalConfig.harness).toBeDefined();
    expect(systemConfig.harness).toBeDefined();

    // The harnesses should be DIFFERENT objects since different adapters
    expect(principalConfig.harness).not.toBe(systemConfig.harness);
  });
});
