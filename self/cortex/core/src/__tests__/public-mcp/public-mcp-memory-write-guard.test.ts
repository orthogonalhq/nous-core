import { describe, expect, it, vi } from 'vitest';
import { PublicMcpExecutionBridge } from '../../public-mcp/public-mcp-execution-bridge.js';

describe('PublicMcpExecutionBridge memory write guard', () => {
  it('never routes Phase 13.1 public requests into memory_write when mappings are not enabled', async () => {
    const executor = {
      execute: vi.fn(),
    };
    const bridge = new PublicMcpExecutionBridge({
      mappings: [
        {
          externalName: 'ortho.memory.v1.put',
          internalName: 'memory_write',
          requiredScopes: ['ortho.memory.stm.write'],
          phaseAvailability: '13.2',
          enabledInCurrentPhase: false,
          bootstrapMode: 'first_write',
        },
      ],
      executor,
    });

    const result = await bridge.executeMappedTool({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      jsonrpc: '2.0',
      rpcId: 'rpc-1',
      protocolVersion: '2025-11-25',
      method: 'tools/call',
      toolName: 'ortho.memory.v1.put',
      arguments: {
        namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
      subject: {
        class: 'ExternalClient',
        clientId: 'client-1',
        clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        scopes: ['ortho.memory.stm.write'],
        audience: 'urn:nous:ortho:mcp',
      },
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    expect(result.rejectReason).toBe('phase_not_enabled');
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
