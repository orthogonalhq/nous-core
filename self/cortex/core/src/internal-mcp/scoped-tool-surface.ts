import { NousError, type AgentClass, type IScopedMcpToolSurface } from '@nous/shared';
import { getLifecycleUnavailableMessage } from '../agent-gateway/lifecycle-hooks.js';
import { getAuthorizedInternalMcpTools } from './authorization-matrix.js';
import { createCapabilityHandlers } from './capability-handlers.js';
import {
  getDynamicInternalMcpToolEntry,
  getInternalMcpCatalogEntry,
  INTERNAL_MCP_CATALOG,
  listDynamicInternalMcpToolEntries,
} from './catalog.js';
import type { InternalMcpScopedToolSurfaceOptions } from './types.js';

export class ScopedMcpToolSurface implements IScopedMcpToolSurface {
  private readonly allowed: ReadonlySet<string>;
  private readonly handlers;

  constructor(private readonly options: InternalMcpScopedToolSurfaceOptions) {
    const baseline = getAuthorizedInternalMcpTools(this.options.agentClass);
    const leaseGrants = this.options.lease?.granted_tools ?? [];
    if (leaseGrants.length > 0) {
      const merged = new Set<string>(baseline);
      for (const tool of leaseGrants) {
        merged.add(tool);
      }
      this.allowed = merged;
    } else {
      this.allowed = baseline;
    }
    this.handlers = createCapabilityHandlers({
      agentClass: this.options.agentClass,
      agentId: this.options.agentId,
      deps: this.options.deps,
    });
  }

  async listTools() {
    return [
      ...INTERNAL_MCP_CATALOG
        .filter((entry) => this.allowed.has(entry.name))
        .map((entry) => entry.definition),
      ...listDynamicInternalMcpToolEntries(this.options.agentClass).map(
        (entry) => entry.definition,
      ),
    ];
  }

  async executeTool(
    name: string,
    params: unknown,
    execution?: import('@nous/shared').GatewayExecutionContext,
  ) {
    const entry = getInternalMcpCatalogEntry(name);
    const dynamicEntry = getDynamicInternalMcpToolEntry(name);
    if (!entry && !dynamicEntry) {
      throw new NousError(
        `Tool ${name} is not available for ${this.options.agentClass}`,
        'TOOL_NOT_AVAILABLE',
      );
    }

    if (dynamicEntry) {
      if (!dynamicEntry.visibleTo.includes(this.options.agentClass)) {
        throw new NousError(
          `Tool ${name} is not available for ${this.options.agentClass}`,
          'TOOL_NOT_AVAILABLE',
        );
      }
      return dynamicEntry.execute(params, execution);
    }

    if (!entry) {
      throw new NousError(
        `Tool ${name} is not available for ${this.options.agentClass}`,
        'TOOL_NOT_AVAILABLE',
      );
    }

    if (!this.allowed.has(entry.name)) {
      throw new NousError(
        `Tool ${name} is not available for ${this.options.agentClass}`,
        'TOOL_NOT_AVAILABLE',
      );
    }

    if (entry.kind === 'lifecycle') {
      throw new NousError(
        getLifecycleUnavailableMessage(name as never),
        'LIFECYCLE_TOOL_ONLY',
      );
    }

    const handler = this.handlers[
      entry.name as keyof typeof this.handlers
    ];
    return handler(params, execution);
  }
}

export function createScopedMcpToolSurface(
  options: InternalMcpScopedToolSurfaceOptions,
): IScopedMcpToolSurface {
  return new ScopedMcpToolSurface(options);
}

export function getVisibleInternalMcpTools(agentClass: AgentClass) {
  return [
    ...INTERNAL_MCP_CATALOG
      .filter((entry) => getAuthorizedInternalMcpTools(agentClass).has(entry.name))
      .map((entry) => entry.name),
    ...listDynamicInternalMcpToolEntries(agentClass).map((entry) => entry.name),
  ];
}
