import type { PublicMcpSubject, PublicMcpToolMappingEntry } from '@nous/shared';
import { PublicMcpToolMappingEntrySchema } from '@nous/shared';

export const PUBLIC_MCP_TOOL_MAPPINGS: readonly PublicMcpToolMappingEntry[] = [
  {
    externalName: 'ortho.memory.v1.put',
    internalName: 'external_memory_put',
    requiredScopes: ['ortho.memory.stm.write'],
    phaseAvailability: '13.2',
    enabledInCurrentPhase: false,
    bootstrapMode: 'first_write',
  },
  {
    externalName: 'ortho.memory.v1.get',
    internalName: 'external_memory_get',
    requiredScopes: ['ortho.memory.stm.read'],
    phaseAvailability: '13.2',
    enabledInCurrentPhase: false,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.memory.v1.search',
    internalName: 'external_memory_search',
    requiredScopes: ['ortho.memory.ltm.read'],
    phaseAvailability: '13.2',
    enabledInCurrentPhase: false,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.memory.v1.delete',
    internalName: 'external_memory_delete',
    requiredScopes: ['ortho.memory.stm.delete'],
    phaseAvailability: '13.2',
    enabledInCurrentPhase: false,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.memory.v1.compact',
    internalName: 'external_memory_compact',
    requiredScopes: ['ortho.memory.ltm.write'],
    phaseAvailability: '13.2',
    enabledInCurrentPhase: false,
    bootstrapMode: 'none',
  },
  {
    externalName: 'ortho.agents.v1.list',
    internalName: 'public_agent_list',
    requiredScopes: ['ortho.agents.invoke'],
    phaseAvailability: '13.3',
    enabledInCurrentPhase: false,
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
    externalName: 'ortho.system.v1.info',
    internalName: 'public_system_info',
    requiredScopes: ['ortho.system.read'],
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

export function hasRequiredPublicMcpScopes(
  subject: Pick<PublicMcpSubject, 'scopes'>,
  mapping: Pick<PublicMcpToolMappingEntry, 'requiredScopes'>,
): boolean {
  return mapping.requiredScopes.every((scope) => subject.scopes.includes(scope));
}

export function getVisiblePublicToolMappings(
  subject: Pick<PublicMcpSubject, 'scopes'>,
  mappings: readonly PublicMcpToolMappingEntry[] = PUBLIC_MCP_TOOL_MAPPINGS,
): PublicMcpToolMappingEntry[] {
  return mappings.filter(
    (mapping) =>
      mapping.enabledInCurrentPhase && hasRequiredPublicMcpScopes(subject, mapping),
  );
}
