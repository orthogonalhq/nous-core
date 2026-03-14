import type {
  PublicMcpCompactionStrategy,
  PublicMcpExecutionRequest,
  PublicMcpMemoryTier,
  PublicMcpScope,
  PublicMcpSubject,
  PublicMcpToolMappingEntry,
} from '@nous/shared';
import { PublicMcpToolMappingEntrySchema } from '@nous/shared';

export const PUBLIC_MCP_TOOL_MAPPINGS: readonly PublicMcpToolMappingEntry[] = [
  {
    externalName: 'ortho.memory.v1.put',
    internalName: 'external_memory_put',
    requiredScopes: ['ortho.memory.stm.write', 'ortho.memory.ltm.write'],
    scopeStrategy: 'memory_write_by_tier',
    phaseAvailability: '13.2',
    enabledInCurrentPhase: true,
    bootstrapMode: 'first_write',
  },
  {
    externalName: 'ortho.memory.v1.get',
    internalName: 'external_memory_get',
    requiredScopes: ['ortho.memory.stm.read', 'ortho.memory.ltm.read'],
    scopeStrategy: 'memory_read_by_tier',
    phaseAvailability: '13.2',
    enabledInCurrentPhase: true,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.memory.v1.search',
    internalName: 'external_memory_search',
    requiredScopes: ['ortho.memory.stm.read', 'ortho.memory.ltm.read'],
    scopeStrategy: 'memory_read_by_tier',
    phaseAvailability: '13.2',
    enabledInCurrentPhase: true,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.memory.v1.delete',
    internalName: 'external_memory_delete',
    requiredScopes: ['ortho.memory.stm.delete', 'ortho.memory.ltm.delete'],
    scopeStrategy: 'memory_delete_by_tier',
    phaseAvailability: '13.2',
    enabledInCurrentPhase: true,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.memory.v1.compact',
    internalName: 'external_memory_compact',
    requiredScopes: ['ortho.memory.stm.write', 'ortho.memory.ltm.write'],
    scopeStrategy: 'memory_compact_external',
    phaseAvailability: '13.2',
    enabledInCurrentPhase: true,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.agents.v1.list',
    internalName: 'public_agent_list',
    requiredScopes: ['ortho.agents.invoke'],
    scopeStrategy: 'static',
    phaseAvailability: '13.3',
    enabledInCurrentPhase: false,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.agents.v1.invoke',
    internalName: 'public_agent_invoke',
    requiredScopes: ['ortho.agents.invoke'],
    scopeStrategy: 'static',
    phaseAvailability: '13.3',
    enabledInCurrentPhase: false,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.system.v1.info',
    internalName: 'public_system_info',
    requiredScopes: ['ortho.system.read'],
    scopeStrategy: 'static',
    phaseAvailability: '13.3',
    enabledInCurrentPhase: false,
    bootstrapMode: 'none',
  },
].map((entry) => PublicMcpToolMappingEntrySchema.parse(entry)) as readonly PublicMcpToolMappingEntry[];

const PUBLIC_TOOL_ENTRY_BY_NAME = new Map(
  PUBLIC_MCP_TOOL_MAPPINGS.map((entry) => [entry.externalName, entry] as const),
);

export function getPublicToolMapping(
  externalName?: string | null,
): PublicMcpToolMappingEntry | null {
  if (!externalName) {
    return null;
  }
  return PUBLIC_TOOL_ENTRY_BY_NAME.get(externalName) ?? null;
}

function resolveTierScopes(tier: PublicMcpMemoryTier, mode: 'read' | 'write' | 'delete'): PublicMcpScope[] {
  if (mode === 'read') {
    return tier === 'stm' ? ['ortho.memory.stm.read'] : ['ortho.memory.ltm.read'];
  }
  if (mode === 'write') {
    return tier === 'stm' ? ['ortho.memory.stm.write'] : ['ortho.memory.ltm.write'];
  }
  return tier === 'stm' ? ['ortho.memory.stm.delete'] : ['ortho.memory.ltm.delete'];
}

function resolveCompactScopes(strategy: PublicMcpCompactionStrategy): PublicMcpScope[] {
  return strategy === 'summarize'
    ? ['ortho.memory.stm.write']
    : ['ortho.memory.ltm.write'];
}

export function resolvePublicMcpRequiredScopes(
  mapping: Pick<PublicMcpToolMappingEntry, 'scopeStrategy' | 'requiredScopes'>,
  requestOrArgs?: Pick<PublicMcpExecutionRequest, 'arguments'> | Record<string, unknown>,
): PublicMcpScope[] {
  const args =
    requestOrArgs && 'arguments' in requestOrArgs
      ? requestOrArgs.arguments ?? {}
      : requestOrArgs ?? {};

  switch (mapping.scopeStrategy) {
    case 'memory_read_by_tier': {
      const tier = (args as { tier?: unknown }).tier;
      if (tier === 'stm' || tier === 'ltm') {
        return resolveTierScopes(tier, 'read');
      }
      if (tier === 'both') {
        return ['ortho.memory.stm.read', 'ortho.memory.ltm.read'];
      }
      return ['ortho.memory.ltm.read'];
    }
    case 'memory_write_by_tier': {
      const tier = (args as { tier?: unknown }).tier;
      return resolveTierScopes(tier === 'ltm' ? 'ltm' : 'stm', 'write');
    }
    case 'memory_delete_by_tier': {
      const tier = (args as { tier?: unknown }).tier;
      return resolveTierScopes(tier === 'ltm' ? 'ltm' : 'stm', 'delete');
    }
    case 'memory_compact_external': {
      const strategy = (args as { strategy?: unknown }).strategy;
      return resolveCompactScopes(
        strategy === 'extract_facts' ? 'extract_facts' : 'summarize',
      );
    }
    case 'static':
    default:
      return [...mapping.requiredScopes];
  }
}

export function hasRequiredPublicMcpScopes(
  subject: Pick<PublicMcpSubject, 'scopes'>,
  mapping: Pick<PublicMcpToolMappingEntry, 'scopeStrategy' | 'requiredScopes'>,
  requestOrArgs?: Pick<PublicMcpExecutionRequest, 'arguments'> | Record<string, unknown>,
): boolean {
  return resolvePublicMcpRequiredScopes(mapping, requestOrArgs).every((scope) =>
    subject.scopes.includes(scope),
  );
}

function canAdvertisePublicTool(
  subject: Pick<PublicMcpSubject, 'scopes'>,
  mapping: Pick<PublicMcpToolMappingEntry, 'scopeStrategy' | 'requiredScopes'>,
): boolean {
  if (mapping.scopeStrategy === 'static') {
    return hasRequiredPublicMcpScopes(subject, mapping);
  }

  return mapping.requiredScopes.some((scope) => subject.scopes.includes(scope));
}

export function getVisiblePublicToolMappings(
  subject: Pick<PublicMcpSubject, 'scopes'>,
  mappings: readonly PublicMcpToolMappingEntry[] = PUBLIC_MCP_TOOL_MAPPINGS,
): PublicMcpToolMappingEntry[] {
  return mappings.filter(
    (mapping) => mapping.enabledInCurrentPhase && canAdvertisePublicTool(subject, mapping),
  );
}
