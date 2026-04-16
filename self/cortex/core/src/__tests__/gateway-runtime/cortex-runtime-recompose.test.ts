/**
 * CortexRuntime.recomposeHarnessForClass — WR-148 phase 1.1 / T5c
 *
 * Tier 2 behavior test: validates runtime harness recomposition, including
 * turn-in-progress guard, deferred recompose application, and last-write-wins
 * semantics for rapid vendor changes during an active turn.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AgentGatewayConfig, ILogger, ILogChannel, IModelRouter } from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import { resolveAdapter } from '../../agent-gateway/adapters/index.js';
import {
  createDocumentStore,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

function createMockLogger(): ILogger & { channels: Map<string, ILogChannel & { info: ReturnType<typeof vi.fn> }> } {
  const channels = new Map<string, ILogChannel & { info: ReturnType<typeof vi.fn> }>();
  return {
    channels,
    channel(namespace: string) {
      if (!channels.has(namespace)) {
        channels.set(namespace, { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), isEnabled: () => true });
      }
      return channels.get(namespace)!;
    },
    bindConfig: vi.fn(),
    setLevel: vi.fn(),
  };
}

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

function createRuntime(logger?: ILogger) {
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

function getTurnInProgressByClass(
  runtime: ReturnType<typeof createPrincipalSystemGatewayRuntime>,
): Map<string, boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (runtime as any).turnInProgressByClass as Map<string, boolean>;
}

function getPendingRecompose(
  runtime: ReturnType<typeof createPrincipalSystemGatewayRuntime>,
): Map<string, string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (runtime as any).pendingRecompose as Map<string, string>;
}

describe('CortexRuntime.recomposeHarnessForClass (WR-148 phase 1.1)', () => {
  it('swaps Principal harness to the Ollama adapter', () => {
    const runtime = createRuntime();
    const harnessBefore = readPrincipalConfig(runtime).harness;
    const gatewayRef = runtime.getPrincipalGateway();

    runtime.recomposeHarnessForClass('Cortex::Principal', 'ollama');

    const harnessAfter = readPrincipalConfig(runtime).harness;
    // Harness is replaced
    expect(harnessAfter).not.toBe(harnessBefore);
    expect(harnessAfter).toBeDefined();
    // Gateway identity preserved
    expect(runtime.getPrincipalGateway()).toBe(gatewayRef);
  });

  it('swaps System harness to the Ollama adapter', () => {
    const runtime = createRuntime();
    const harnessBefore = readSystemConfig(runtime).harness;

    runtime.recomposeHarnessForClass('Cortex::System', 'ollama');

    const harnessAfter = readSystemConfig(runtime).harness;
    expect(harnessAfter).not.toBe(harnessBefore);
    expect(harnessAfter).toBeDefined();
  });

  it('recomposition with anthropic vendor produces adapter with cacheControl capability', () => {
    const runtime = createRuntime();
    runtime.recomposeHarnessForClass('Cortex::Principal', 'anthropic');

    // Verify the adapter matches by checking the anthropic-only capability
    const anthropicAdapter = resolveAdapter('anthropic');
    expect(anthropicAdapter.capabilities.cacheControl).toBe(true);
  });

  it('recomposition with unknown vendor falls back to text adapter', () => {
    const logger = createMockLogger();
    const runtime = createRuntime(logger);

    // 'unknown_vendor' should fallback to text adapter via resolveAdapter
    runtime.recomposeHarnessForClass('Cortex::Principal', 'unknown_vendor' as never);

    const log = logger.channels.get('nous:cortex-runtime');
    expect(log?.info).toHaveBeenCalledWith(
      expect.stringContaining('Recomposed harness for Cortex::Principal with vendor unknown_vendor'),
    );
  });

  describe('turn-in-progress guard', () => {
    it('defers recompose when turn is in progress', () => {
      const logger = createMockLogger();
      const runtime = createRuntime(logger);

      // Simulate turn in progress
      getTurnInProgressByClass(runtime).set('Cortex::Principal', true);

      const harnessBefore = readPrincipalConfig(runtime).harness;
      runtime.recomposeHarnessForClass('Cortex::Principal', 'ollama');

      // Harness should NOT be changed yet
      expect(readPrincipalConfig(runtime).harness).toBe(harnessBefore);

      // Should be stored in pendingRecompose
      expect(getPendingRecompose(runtime).get('Cortex::Principal')).toBe('ollama');

      const log = logger.channels.get('nous:cortex-runtime');
      expect(log?.info).toHaveBeenCalledWith(
        expect.stringContaining('Deferred harness recompose for Cortex::Principal'),
      );
    });

    it('applies deferred recompose when turn completes (via checkPendingRecompose)', () => {
      const runtime = createRuntime();
      vi.spyOn(console, 'info').mockImplementation(() => {});

      // Simulate turn in progress, then a deferred recompose
      getTurnInProgressByClass(runtime).set('Cortex::Principal', true);
      runtime.recomposeHarnessForClass('Cortex::Principal', 'ollama');

      const harnessDuringTurn = readPrincipalConfig(runtime).harness;

      // Simulate turn completion
      getTurnInProgressByClass(runtime).set('Cortex::Principal', false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (runtime as any).checkPendingRecompose('Cortex::Principal');

      // Now the harness should be swapped
      expect(readPrincipalConfig(runtime).harness).not.toBe(harnessDuringTurn);
      // And the pending map should be cleared
      expect(getPendingRecompose(runtime).get('Cortex::Principal')).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('last-write-wins for multiple rapid recompose calls during active turn', () => {
      const runtime = createRuntime();
      vi.spyOn(console, 'info').mockImplementation(() => {});

      // Simulate turn in progress
      getTurnInProgressByClass(runtime).set('Cortex::Principal', true);

      // Rapid successive calls
      runtime.recomposeHarnessForClass('Cortex::Principal', 'ollama');
      runtime.recomposeHarnessForClass('Cortex::Principal', 'anthropic');
      runtime.recomposeHarnessForClass('Cortex::Principal', 'openai');

      // Only the last vendor should be stored
      expect(getPendingRecompose(runtime).get('Cortex::Principal')).toBe('openai');

      // Simulate turn completion
      getTurnInProgressByClass(runtime).set('Cortex::Principal', false);
      const harnessBefore = readPrincipalConfig(runtime).harness;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (runtime as any).checkPendingRecompose('Cortex::Principal');

      // Harness should be swapped (only once — for 'openai')
      expect(readPrincipalConfig(runtime).harness).not.toBe(harnessBefore);
      expect(getPendingRecompose(runtime).get('Cortex::Principal')).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('no-op checkPendingRecompose when no pending recompose exists', () => {
      const runtime = createRuntime();
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const harnessBefore = readPrincipalConfig(runtime).harness;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (runtime as any).checkPendingRecompose('Cortex::Principal');

      // Harness unchanged
      expect(readPrincipalConfig(runtime).harness).toBe(harnessBefore);

      // No deferred recompose log
      expect(spy).not.toHaveBeenCalledWith(
        expect.stringContaining('Applied deferred harness recompose'),
      );
      spy.mockRestore();
    });
  });
});
