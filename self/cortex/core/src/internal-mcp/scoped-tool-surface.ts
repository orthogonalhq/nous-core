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
import {
  buildUnknownToolError,
  formatZodMessage,
  isZodLikeError,
} from './tool-error-helpers.js';
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
      throw buildUnknownToolError({
        requestedName: name,
        agentClass: this.options.agentClass,
        available: this.computeAvailableToolNames(),
      });
    }

    if (dynamicEntry) {
      if (!dynamicEntry.visibleTo.includes(this.options.agentClass)) {
        throw buildUnknownToolError({
          requestedName: name,
          agentClass: this.options.agentClass,
          available: this.computeAvailableToolNames(),
        });
      }
      try {
        return await dynamicEntry.execute(params, execution);
      } catch (e) {
        if (isZodLikeError(e)) {
          throw new NousError(
            `Tool ${name} arguments invalid: ${formatZodMessage(e)}`,
            'INVALID_ARGUMENTS',
            { tool_error_kind: 'arguments_invalid', requested_tool: name } as Record<string, unknown>,
          );
        }
        throw e;
      }
    }

    if (!entry) {
      throw buildUnknownToolError({
        requestedName: name,
        agentClass: this.options.agentClass,
        available: this.computeAvailableToolNames(),
      });
    }

    if (!this.allowed.has(entry.name)) {
      throw buildUnknownToolError({
        requestedName: name,
        agentClass: this.options.agentClass,
        available: this.computeAvailableToolNames(),
      });
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
    try {
      return await handler(params, execution);
    } catch (e) {
      if (isZodLikeError(e)) {
        throw new NousError(
          `Tool ${name} arguments invalid: ${formatZodMessage(e)}`,
          'INVALID_ARGUMENTS',
          { tool_error_kind: 'arguments_invalid', requested_tool: name } as Record<string, unknown>,
        );
      }
      throw e;
    }
  }

  /**
   * Computes the canonical-name list authorized for the calling agent class:
   * the union of catalog tools the agent class is authorized for and dynamic
   * tools visible to the agent. Mirrors the union `listTools()` computes
   * (catalog-allowed + dynamic-visible) so the recovery-frame message reflects
   * exactly the set of tools the model was told it could use.
   */
  private computeAvailableToolNames(): readonly string[] {
    const catalogNames = INTERNAL_MCP_CATALOG
      .filter((entry) => this.allowed.has(entry.name))
      .map((entry) => entry.name);
    const dynamicNames = listDynamicInternalMcpToolEntries(this.options.agentClass)
      .map((entry) => entry.definition.name);
    return [...catalogNames, ...dynamicNames];
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
