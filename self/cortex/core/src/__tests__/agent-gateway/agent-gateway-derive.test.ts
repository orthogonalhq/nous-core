/**
 * AgentGateway — deriveDefaultModelRole tests.
 *
 * Validates the class-aware derive function introduced by WR-142 R7/E5-B.
 * The derive replaces the former `DEFAULT_MODEL_ROLE = 'reasoner'` constant
 * with a 4-entry lookup table keyed by AgentClass.
 *
 * NOTE: Test cases (c) and (d) use the bare `'Orchestrator'` / `'Worker'`
 * values from the closed AgentClassSchema enum, NOT the wildcard notation
 * `'Orchestrator::*'` from the decision docs. The AgentClassSchema is a
 * closed 4-entry z.enum without subtypes (SDS-F-1 normalization).
 */
import { describe, it, expect, vi } from 'vitest';
import { createGatewayHarness, createGatewayInput } from './helpers.js';

describe('AgentGateway deriveDefaultModelRole', () => {
  it('(a) Cortex::Principal derives cortex-chat', async () => {
    const { gateway, modelProvider } = createGatewayHarness({
      agentClass: 'Cortex::Principal',
    });

    const invokeSpy = vi.spyOn(modelProvider, 'invoke');

    await gateway.run(createGatewayInput('test'));

    expect(invokeSpy).toHaveBeenCalled();
    const invokeCall = invokeSpy.mock.calls[0]![0];
    expect(invokeCall.role).toBe('cortex-chat');
  });

  it('(b) Cortex::System derives cortex-system', async () => {
    const { gateway, modelProvider } = createGatewayHarness({
      agentClass: 'Cortex::System',
    });

    const invokeSpy = vi.spyOn(modelProvider, 'invoke');

    await gateway.run(createGatewayInput('test'));

    expect(invokeSpy).toHaveBeenCalled();
    const invokeCall = invokeSpy.mock.calls[0]![0];
    expect(invokeCall.role).toBe('cortex-system');
  });

  it('(c) Orchestrator (bare) derives orchestrators', async () => {
    const { gateway, modelProvider } = createGatewayHarness({
      agentClass: 'Orchestrator',
    });

    const invokeSpy = vi.spyOn(modelProvider, 'invoke');

    await gateway.run(createGatewayInput('test'));

    expect(invokeSpy).toHaveBeenCalled();
    const invokeCall = invokeSpy.mock.calls[0]![0];
    expect(invokeCall.role).toBe('orchestrators');
  });

  it('(d) Worker (bare) derives workers', async () => {
    const { gateway, modelProvider } = createGatewayHarness({
      agentClass: 'Worker',
    });

    const invokeSpy = vi.spyOn(modelProvider, 'invoke');

    await gateway.run(createGatewayInput('test'));

    expect(invokeSpy).toHaveBeenCalled();
    const invokeCall = invokeSpy.mock.calls[0]![0];
    expect(invokeCall.role).toBe('workers');
  });

  it('(e) undefined agentClass falls back to cortex-chat (I5)', async () => {
    const { gateway, modelProvider } = createGatewayHarness({
      agentClass: undefined,
    });

    const invokeSpy = vi.spyOn(modelProvider, 'invoke');

    await gateway.run(createGatewayInput('test'));

    expect(invokeSpy).toHaveBeenCalled();
    const invokeCall = invokeSpy.mock.calls[0]![0];
    expect(invokeCall.role).toBe('cortex-chat');
  });

  it('(f) explicit config.modelRole overrides the derive (I-3)', async () => {
    const { modelProvider } = createGatewayHarness({
      agentClass: 'Cortex::Principal',
    });

    // Create a gateway with explicit modelRole
    const { AgentGateway } = await import('../../agent-gateway/agent-gateway.js');
    const { createToolSurface, AGENT_ID, NOW, InMemoryGatewayOutboxSink } = await import('./helpers.js');

    const gateway = new AgentGateway({
      agentClass: 'Cortex::Principal',
      agentId: AGENT_ID,
      toolSurface: createToolSurface(),
      modelProvider,
      modelRole: 'orchestrators', // explicit override
      outbox: new InMemoryGatewayOutboxSink(),
      now: () => NOW,
      nowMs: () => Date.parse(NOW),
      idFactory: () => AGENT_ID,
    });

    const invokeSpy = vi.spyOn(modelProvider, 'invoke');

    await gateway.run(createGatewayInput('test'));

    expect(invokeSpy).toHaveBeenCalled();
    const invokeCall = invokeSpy.mock.calls[0]![0];
    expect(invokeCall.role).toBe('orchestrators');
  });
});
