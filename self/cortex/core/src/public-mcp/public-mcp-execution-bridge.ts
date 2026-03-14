import type {
  NousError,
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
  resolvePublicMcpRequiredScopes,
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
      const requiredScopes = resolvePublicMcpRequiredScopes(mapping, request);
      return this.block(
        request,
        'scope_insufficient',
        403,
        mapping.internalName,
        -32003,
        'Scope insufficient for requested tool.',
        { requiredScopes },
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

    let result: ToolResult;
    try {
      result = await this.options.executor.execute(mapping.internalName, request);
    } catch (error) {
      const mapped = mapExecutionError(error);
      return this.block(
        request,
        mapped.rejectReason,
        mapped.httpStatus,
        mapping.internalName,
        mapped.code,
        mapped.message,
        mapped.data,
      );
    }

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
    extraData?: Record<string, unknown>,
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
        data: internalToolName
          ? { internalToolName, rejectReason, ...extraData }
          : { rejectReason, ...extraData },
      },
    });
  }
}

function mapExecutionError(error: unknown): {
  rejectReason: PublicMcpRejectReason;
  httpStatus: number;
  code: number;
  message: string;
  data?: Record<string, unknown>;
} {
  const nousError = error as NousError | undefined;
  switch (nousError?.code) {
    case 'VALIDATION_ERROR':
      return {
        rejectReason: 'request_schema_invalid',
        httpStatus: 400,
        code: -32600,
        message: nousError.message,
        data: nousError.context,
      };
    case 'NAMESPACE_UNAUTHORIZED':
      return {
        rejectReason: 'namespace_unauthorized',
        httpStatus: 403,
        code: -32003,
        message: nousError.message,
      };
    case 'SOURCE_QUARANTINED':
      return {
        rejectReason: 'source_quarantined',
        httpStatus: 409,
        code: -32006,
        message: nousError.message,
      };
    case 'QUOTA_EXCEEDED':
      return {
        rejectReason: 'quota_exceeded',
        httpStatus: 429,
        code: -32007,
        message: nousError.message,
      };
    case 'RATE_LIMITED':
      return {
        rejectReason: 'rate_limited',
        httpStatus: 429,
        code: -32008,
        message: nousError.message,
      };
    default:
      return {
        rejectReason: 'tool_not_available',
        httpStatus: 502,
        code: -32005,
        message: error instanceof Error ? error.message : 'Tool execution failed.',
      };
  }
}
