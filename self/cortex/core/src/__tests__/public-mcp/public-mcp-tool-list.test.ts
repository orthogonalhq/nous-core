import { describe, expect, it } from 'vitest';
import { PublicMcpExecutionBridge } from '../../public-mcp/public-mcp-execution-bridge.js';

describe('PublicMcpExecutionBridge listTools', () => {
  it('returns only the intersection of scopes and current-phase-enabled mappings', async () => {
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
        {
          externalName: 'ortho.agents.v1.invoke',
          internalName: 'public_agent_invoke',
          requiredScopes: ['ortho.agents.invoke'],
          phaseAvailability: '13.3',
          enabledInCurrentPhase: false,
          bootstrapMode: 'none',
        },
        {
          externalName: 'ortho.system.v1.admin',
          internalName: 'public_system_admin',
          requiredScopes: ['ortho.admin'],
          phaseAvailability: '13.1',
          enabledInCurrentPhase: true,
          bootstrapMode: 'none',
        },
      ],
    });

    const tools = await bridge.listTools({
      class: 'ExternalClient',
      clientId: 'client-1',
      clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      scopes: ['ortho.system.read'],
      audience: 'urn:nous:ortho:mcp',
    });

    expect(tools.map((tool) => tool.name)).toEqual(['ortho.system.v1.info']);
  });
});
