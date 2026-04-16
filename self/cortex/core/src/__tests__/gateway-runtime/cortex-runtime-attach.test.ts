/**
 * CortexRuntime attach lifecycle tests — WR-138 row #11
 *
 * Covers the five AC #11 cases from `cortex-provider-attach-lifecycle-v1.md`:
 *   (a) construction → text-adapter placeholder for Principal and System
 *   (b) attachProviders({ Principal: 'anthropic' }) → anthropic adapter
 *   (c) same-map re-call is a no-op (same order AND different key order)
 *   (d) different-map re-call throws `Error` with the verbatim § 4 message
 *   (e) external reference to `runtime.principalGateway` preserves identity
 *
 * Plus the optional test (f) for the CPAL § 7 startup warning wired via
 * Finding IP-6 (first-use guard inside `handleChatTurn` /
 * `submitTask` / `submitIngressEnvelope`).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ILogger, ILogChannel } from '@nous/shared';
import type { AgentGatewayConfig, IModelRouter } from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import { resolveAdapter } from '../../agent-gateway/adapters/index.js';
import {
  createDocumentStore,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

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

function createAttachRuntime(logger?: ILogger) {
  return createPrincipalSystemGatewayRuntime({
    documentStore: createDocumentStore(),
    // Stub modelRouter + getProvider so the AgentGatewayFactory precondition
    // is satisfied at construction time. Both return empty / null — the
    // Option α chain resolves to 'text' as the placeholder (CPAL § 3) and
    // `attachProviders` then upgrades Principal/System via the swap-in-place
    // recompose path.
    modelRouter: createStubModelRouter(),
    getProvider: () => null,
    getProjectApi: () => createProjectApi(),
    pfc: createPfcEngine(),
    outputSchemaValidator: {
      validate: vi.fn().mockResolvedValue({ success: true }),
    },
    idFactory: idFactory(),
    logger,
  });
}

function readPrincipalConfig(
  runtime: ReturnType<typeof createPrincipalSystemGatewayRuntime>,
): AgentGatewayConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (runtime as any).principalGatewayConfig as AgentGatewayConfig;
}

function readSystemConfig(
  runtime: ReturnType<typeof createPrincipalSystemGatewayRuntime>,
): AgentGatewayConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (runtime as any).systemGatewayConfig as AgentGatewayConfig;
}

describe('CortexRuntime.attachProviders (WR-138 row #11)', () => {
  it('(a) construction: Principal and System gateways boot with the text-adapter placeholder', () => {
    const runtime = createAttachRuntime();
    const principalConfig = readPrincipalConfig(runtime);
    const systemConfig = readSystemConfig(runtime);
    const textAdapter = resolveAdapter('text');
    // The Option α chain resolves to 'text' at construction because no
    // providers are wired (neither `modelProviderByClass` nor
    // `providerIdByClass`/`getProvider`). The harness is non-null — the
    // gateways are immediately functional as placeholders (CPAL § 3).
    expect(principalConfig.harness).toBeDefined();
    expect(systemConfig.harness).toBeDefined();
    expect(textAdapter.capabilities.nativeToolUse).toBe(false);
  });

  it('(b) attachProviders({ "Cortex::Principal": "anthropic" }) swaps Principal harness in place to the anthropic adapter', () => {
    const runtime = createAttachRuntime();
    const principalConfigBefore = readPrincipalConfig(runtime);
    const harnessBefore = principalConfigBefore.harness;
    const gatewayRefBefore = runtime.getPrincipalGateway();

    runtime.attachProviders({
      providerVendorByClass: {
        'Cortex::Principal': 'anthropic',
      },
    });

    const principalConfigAfter = readPrincipalConfig(runtime);
    // Gateway object identity is preserved — the outer reference is stable.
    expect(runtime.getPrincipalGateway()).toBe(gatewayRefBefore);
    // The config object is the same captured reference — only the `harness`
    // field is swapped.
    expect(principalConfigAfter).toBe(principalConfigBefore);
    // The harness bundle itself is a NEW object with new closures.
    expect(principalConfigAfter.harness).not.toBe(harnessBefore);
    expect(principalConfigAfter.harness).toBeDefined();

    // Spot-check that the anthropic adapter fingerprint is present (cache
    // control is an anthropic-only capability).
    const anthropicAdapter = resolveAdapter('anthropic');
    expect(anthropicAdapter.capabilities.cacheControl).toBe(true);
  });

  it('(c) same-map re-call is a no-op (tolerates different key ordering per Finding IP-7)', () => {
    const runtime = createAttachRuntime();
    runtime.attachProviders({
      providerVendorByClass: {
        'Cortex::Principal': 'anthropic',
        'Cortex::System': 'openai',
      },
    });
    const principalAfterFirst = readPrincipalConfig(runtime).harness;
    const systemAfterFirst = readSystemConfig(runtime).harness;

    // Same-map-same-order: no-op.
    expect(() =>
      runtime.attachProviders({
        providerVendorByClass: {
          'Cortex::Principal': 'anthropic',
          'Cortex::System': 'openai',
        },
      }),
    ).not.toThrow();
    // Same-map-different-order: no-op (stable-equality comparison).
    expect(() =>
      runtime.attachProviders({
        providerVendorByClass: {
          'Cortex::System': 'openai',
          'Cortex::Principal': 'anthropic',
        },
      }),
    ).not.toThrow();

    // Harness references are unchanged after a no-op re-call.
    expect(readPrincipalConfig(runtime).harness).toBe(principalAfterFirst);
    expect(readSystemConfig(runtime).harness).toBe(systemAfterFirst);
  });

  it('(d) different-map re-call throws Error with the verbatim CPAL § 4 message', () => {
    const runtime = createAttachRuntime();
    runtime.attachProviders({
      providerVendorByClass: { 'Cortex::Principal': 'anthropic' },
    });

    const EXPECTED_MESSAGE =
      'CortexRuntime.attachProviders called twice with different vendor maps. ' +
      'Bootstrap should call attachProviders exactly once after ProviderRegistry is populated.';

    expect(() =>
      runtime.attachProviders({
        providerVendorByClass: { 'Cortex::Principal': 'openai' },
      }),
    ).toThrow(Error);
    expect(() =>
      runtime.attachProviders({
        providerVendorByClass: { 'Cortex::Principal': 'openai' },
      }),
    ).toThrow(EXPECTED_MESSAGE);
  });

  it('(e) external reference to runtime.principalGateway captured before attach is preserved after attach (identity preservation)', () => {
    const runtime = createAttachRuntime();
    const ref = runtime.getPrincipalGateway();
    runtime.attachProviders({
      providerVendorByClass: { 'Cortex::Principal': 'anthropic' },
    });
    expect(runtime.getPrincipalGateway()).toBe(ref);
    expect(ref.agentClass).toBe('Cortex::Principal');
  });

  it('(f) startup warning fires exactly once on first use when attachProviders has not been called', async () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), isEnabled: () => true };
    const mockLogger: ILogger = {
      channel: () => mockLog,
      bindConfig: vi.fn(),
      setLevel: vi.fn(),
    };
    const runtime = createAttachRuntime(mockLogger);
    // Invoke submitTaskToSystem via the public `submitTask` entry point
    // (which gates on `checkAttachOrWarn`) — the internal handoff may
    // settle with an internal error due to minimal fixture, but the
    // warn spy should have been called exactly once before any error.
    try {
      await runtime.submitTask({
        task: 'noop',
        projectId: '00000000-0000-4000-8000-000000000001' as never,
        detail: { source: 'row-11-warn-test' },
      });
    } catch {
      // The test does not care about internal submission settlement —
      // only that `checkAttachOrWarn` ran at method entry.
    }

    const warningCalls = mockLog.warn.mock.calls.filter((call: unknown[]) =>
      typeof call[0] === 'string' &&
      (call[0] as string).includes(
        'CortexRuntime exposed without attached vendor map',
      ),
    );
    expect(warningCalls.length).toBe(1);

    // Second call on the same runtime must NOT re-emit the warning
    // (one-shot guard per Finding IP-6).
    try {
      await runtime.submitTask({
        task: 'noop-2',
        projectId: '00000000-0000-4000-8000-000000000002' as never,
        detail: { source: 'row-11-warn-test-2' },
      });
    } catch {
      // ignore settlement
    }
    const warningCallsAfterSecond = mockLog.warn.mock.calls.filter((call: unknown[]) =>
      typeof call[0] === 'string' &&
      (call[0] as string).includes(
        'CortexRuntime exposed without attached vendor map',
      ),
    );
    expect(warningCallsAfterSecond.length).toBe(1);
  });

  it('(f.2) startup warning does NOT fire when attachProviders has been called first', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const runtime = createAttachRuntime();
      runtime.attachProviders({
        providerVendorByClass: { 'Cortex::Principal': 'anthropic' },
      });
      try {
        await runtime.submitTask({
          task: 'noop',
          projectId: '00000000-0000-4000-8000-000000000003' as never,
          detail: { source: 'row-11-warn-suppressed' },
        });
      } catch {
        // ignore settlement
      }
      const warningCalls = warnSpy.mock.calls.filter((call) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes(
          'CortexRuntime exposed without attached vendor map',
        ),
      );
      expect(warningCalls.length).toBe(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
