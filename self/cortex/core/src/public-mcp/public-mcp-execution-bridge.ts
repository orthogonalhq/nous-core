import type {
  PublicMcpExecutionRequest,
  PublicMcpExecutionResult,
  PublicMcpRejectReason,
  PublicMcpSubject,
  PublicMcpToolDefinition,
  PublicMcpToolMappingEntry,
  ToolResult,
} from '@nous/shared';
import {
  PublicMcpExecutionResultSchema,
  PublicMcpToolDefinitionSchema,
} from '@nous/shared';
import {
  getPublicToolMapping,
  getVisiblePublicToolMappings,
  hasRequiredPublicMcpScopes,
  PUBLIC_MCP_TOOL_MAPPINGS,
} from '../internal-mcp/public-tool-mappings.js';

export interface PublicMcpInternalExecutor {
  execute(internalName: string, request: PublicMcpExecutionRequest): Promise<ToolResult>;
}

export interface PublicMcpExecutionBridgeOptions {
  mappings?: readonly PublicMcpToolMappingEntry[];
  executor?: PublicMcpInternalExecutor;
}

export interface IPublicMcpExecutionBridge {
  listTools(subject: PublicMcpSubject): Promise<PublicMcpToolDefinition[]>;
  executeMappedTool(request: PublicMcpExecutionRequest): Promise<PublicMcpExecutionResult>;
}

export class PublicMcpExecutionBridge implements IPublicMcpExecutionBridge {
  private readonly mappings: readonly PublicMcpToolMappingEntry[];

  constructor(private readonly options: PublicMcpExecutionBridgeOptions = {}) {
    this.mappings = options.mappings ?? PUBLIC_MCP_TOOL_MAPPINGS;
  }

  async listTools(subject: PublicMcpSubject): Promise<PublicMcpToolDefinition[]> {
    return getVisiblePublicToolMappings(subject, this.mappings).map((mapping) =>
      PublicMcpToolDefinitionSchema.parse({
        name: mapping.externalName,
        version: '1.0.0',
        description: `Public MCP tool ${mapping.externalName}.`,
        inputSchema: {},
        outputSchema: {},
        capabilities: ['external'],
        permissionScope: 'external',
      }),
    );
  }

  async executeMappedTool(
    request: PublicMcpExecutionRequest,
  ): Promise<PublicMcpExecutionResult> {
    const mapping = this.resolveMapping(request.toolName);
    if (!mapping) {
      return this.block(request, 'tool_not_available', 404, undefined, -32601, 'Tool not available.');
    }

    if (!hasRequiredPublicMcpScopes(request.subject, mapping)) {
      return this.block(
        request,
        'scope_insufficient',
        403,
        mapping.internalName,
        -32003,
        'Scope insufficient for requested tool.',
      );
    }

    if (!mapping.enabledInCurrentPhase) {
      return this.block(
        request,
        'phase_not_enabled',
        403,
        mapping.internalName,
        -32004,
        'Requested tool is not enabled in the current phase.',
      );
    }

    if (!this.options.executor) {
      return this.block(
        request,
        'tool_not_available',
        501,
        mapping.internalName,
        -32601,
        'Requested tool is not implemented on this runtime.',
      );
    }

    const result = await this.options.executor.execute(mapping.internalName, request);
    if (!result.success) {
      return this.block(
        request,
        'tool_not_available',
        502,
        mapping.internalName,
        -32005,
        result.error ?? 'Tool execution failed.',
      );
    }

    return PublicMcpExecutionResultSchema.parse({
      requestId: request.requestId,
      httpStatus: 200,
      rpcId: request.rpcId,
      result: result.output,
      internalToolName: mapping.internalName,
    });
  }

  private resolveMapping(toolName?: string): PublicMcpToolMappingEntry | null {
    if (!toolName) {
      return null;
    }

    return (
      this.mappings.find((mapping) => mapping.externalName === toolName) ??
      getPublicToolMapping(toolName)
    );
  }

  private block(
    request: PublicMcpExecutionRequest,
    rejectReason: PublicMcpRejectReason,
    httpStatus: number,
    internalToolName: string | undefined,
    code: number,
    message: string,
  ): PublicMcpExecutionResult {
    return PublicMcpExecutionResultSchema.parse({
      requestId: request.requestId,
      httpStatus,
      rpcId: request.rpcId,
      rejectReason,
      internalToolName,
      error: {
        code,
        message,
        data: internalToolName ? { internalToolName, rejectReason } : { rejectReason },
      },
    });
  }
}
