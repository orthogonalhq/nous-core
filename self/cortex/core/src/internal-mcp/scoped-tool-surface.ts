import { NousError, type AgentClass, type IScopedMcpToolSurface } from '@nous/shared';
import { getLifecycleUnavailableMessage } from '../agent-gateway/lifecycle-hooks.js';
import { getAuthorizedInternalMcpTools } from './authorization-matrix.js';
import { createCapabilityHandlers } from './capability-handlers.js';
import { getInternalMcpCatalogEntry, INTERNAL_MCP_CATALOG } from './catalog.js';
import type { InternalMcpScopedToolSurfaceOptions } from './types.js';

export class ScopedMcpToolSurface implements IScopedMcpToolSurface {
  private readonly allowed: ReadonlySet<string>;
  private readonly handlers;

  constructor(private readonly options: InternalMcpScopedToolSurfaceOptions) {
    this.allowed = getAuthorizedInternalMcpTools(this.options.agentClass);
    this.handlers = createCapabilityHandlers({
      agentClass: this.options.agentClass,
      agentId: this.options.agentId,
      deps: this.options.deps,
    });
  }

  async listTools() {
    return INTERNAL_MCP_CATALOG
      .filter((entry) => this.allowed.has(entry.name))
      .map((entry) => entry.definition);
  }

  async executeTool(
    name: string,
    params: unknown,
    execution?: import('@nous/shared').GatewayExecutionContext,
  ) {
    const entry = getInternalMcpCatalogEntry(name);
    if (!entry || !this.allowed.has(entry.name)) {
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
  return INTERNAL_MCP_CATALOG
    .filter((entry) => getAuthorizedInternalMcpTools(agentClass).has(entry.name))
    .map((entry) => entry.name);
}
