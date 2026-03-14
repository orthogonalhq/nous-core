import { describe, expect, it, vi } from 'vitest';
import { PublicMcpExecutionBridge } from '../../public-mcp/public-mcp-execution-bridge.js';

function createRequest(toolName: string) {
  return {
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    jsonrpc: '2.0' as const,
    rpcId: 'rpc-1',
    protocolVersion: '2025-11-25' as const,
    method: 'tools/call' as const,
    toolName,
    arguments: {},
    subject: {
      class: 'ExternalClient' as const,
      clientId: 'client-1',
      clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      scopes: ['ortho.system.read'],
      audience: 'urn:nous:ortho:mcp',
    },
    requestedAt: '2026-03-14T00:00:00.000Z',
  };
}

describe('PublicMcpExecutionBridge executeMappedTool', () => {
  it('blocks phase-disabled mappings before executor handoff', async () => {
    const executor = {
      execute: vi.fn(),
    };
    const bridge = new PublicMcpExecutionBridge({
      mappings: [
        {
          externalName: 'ortho.system.v1.info',
          internalName: 'public_system_info',
          requiredScopes: ['ortho.system.read'],
          phaseAvailability: '13.3',
          enabledInCurrentPhase: false,
          bootstrapMode: 'none',
        },
      ],
      executor,
    });

    const result = await bridge.executeMappedTool(createRequest('ortho.system.v1.info'));

    expect(result.rejectReason).toBe('phase_not_enabled');
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('routes enabled mappings to the executor', async () => {
    const executor = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        output: { ok: true },
        durationMs: 5,
      }),
    };
    const bridge = new PublicMcpExecutionBridge({
      mappings: [
        {
          externalName: 'ortho.system.v1.info',
          internalName: 'public_system_info',
          requiredScopes: ['ortho.system.read'],
          phaseAvailability: '13.1',
          enabledInCurrentPhase: true,
          bootstrapMode: 'none',
        },
      ],
      executor,
    });

    const result = await bridge.executeMappedTool(createRequest('ortho.system.v1.info'));

    expect(result.result).toEqual({ ok: true });
    expect(executor.execute).toHaveBeenCalledWith(
      'public_system_info',
      expect.objectContaining({ toolName: 'ortho.system.v1.info' }),
    );
  });

  it('rejects binding-derived invoke scopes before executor handoff', async () => {
    const executor = {
      execute: vi.fn(),
    };
    const bridge = new PublicMcpExecutionBridge({
      mappings: [
        {
          externalName: 'ortho.agents.v1.invoke',
          internalName: 'public_agent_invoke',
          requiredScopes: ['ortho.agents.invoke'],
          scopeStrategy: 'agent_invoke_with_bindings',
          phaseAvailability: '13.3',
          enabledInCurrentPhase: true,
          bootstrapMode: 'none',
        },
      ],
      executor,
    });

    const result = await bridge.executeMappedTool({
      ...createRequest('ortho.agents.v1.invoke'),
      subject: {
        ...createRequest('ortho.agents.v1.invoke').subject,
        scopes: ['ortho.agents.invoke'],
      },
      arguments: {
        agentId: 'engineering.workflow',
        input: {
          type: 'text',
          text: 'hello',
        },
        memory: {
          readTiers: ['ltm'],
        },
      },
    });

    expect(result.rejectReason).toBe('scope_insufficient');
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
