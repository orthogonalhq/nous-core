import type { IScopedMcpToolSurface, ToolDefinition, ToolResult } from '@nous/shared';
import {
  SystemDirectiveInjectionSchema,
  SystemTaskSubmissionSchema,
  type SystemContextReplica,
  type SystemDirectiveInjection,
  type SystemSubmissionReceipt,
  type SystemTaskSubmission,
} from './types.js';

/**
 * Principal Communication Bypass Tools
 *
 * `submit_task_to_system` and `inject_directive_to_system` are intentionally
 * outside the internal MCP catalog (`INTERNAL_MCP_CATALOG`) and the
 * authorization matrix (`MATRIX`). They are security-load-bearing bypasses
 * that allow the Cortex::Principal to communicate directly with the System
 * inbox without traversing the standard agent tool surface.
 *
 * These tools are registered on the Principal's tool surface via
 * `getPrincipalCommunicationToolDefinitions()` and executed through
 * `executePrincipalCommunicationTool()`. They must NOT be added to the
 * catalog or matrix — doing so would expose them to non-Principal agent
 * classes through the standard `ScopedMcpToolSurface` filtering.
 *
 * Reference: .architecture/.decisions/2026-04-09-mcp-audit/principal-bypass-disposition-v1.md
 */
export const SUBMIT_TASK_TO_SYSTEM_TOOL_NAME = 'submit_task_to_system';
export const INJECT_DIRECTIVE_TO_SYSTEM_TOOL_NAME = 'inject_directive_to_system';

export interface ISystemInboxSubmissionService {
  submitTask(input: SystemTaskSubmission): Promise<SystemSubmissionReceipt>;
  injectDirective(input: SystemDirectiveInjection): Promise<SystemSubmissionReceipt>;
}

export interface ISystemContextReplicaReader {
  getReplica(): SystemContextReplica;
}

function success(output: unknown): ToolResult {
  return {
    success: true,
    output,
    durationMs: 0,
  };
}

export function getPrincipalCommunicationToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: SUBMIT_TASK_TO_SYSTEM_TOOL_NAME,
      version: '1.0.0',
      description: 'Queue a task for Cortex::System through the runtime inbox.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          projectId: { type: 'string' },
          detail: { type: 'object' },
        },
        required: ['task'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string' },
          dispatchRef: { type: 'string' },
          acceptedAt: { type: 'string' },
          source: { type: 'string' },
          systemReplica: { type: 'object' },
        },
      },
      capabilities: ['runtime', 'communication'],
      permissionScope: 'system_inbox',
    },
    {
      name: INJECT_DIRECTIVE_TO_SYSTEM_TOOL_NAME,
      version: '1.0.0',
      description: 'Inject a directive for Cortex::System through the runtime inbox.',
      inputSchema: {
        type: 'object',
        properties: {
          directive: { type: 'string' },
          priority: { type: 'string' },
          projectId: { type: 'string' },
          detail: { type: 'object' },
        },
        required: ['directive'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string' },
          dispatchRef: { type: 'string' },
          acceptedAt: { type: 'string' },
          source: { type: 'string' },
          systemReplica: { type: 'object' },
        },
      },
      capabilities: ['runtime', 'communication'],
      permissionScope: 'system_inbox',
    },
  ];
}

export function createPrincipalCommunicationToolSurface(args: {
  baseToolSurface: IScopedMcpToolSurface;
  submissionService: ISystemInboxSubmissionService;
  replicaReader: ISystemContextReplicaReader;
}): IScopedMcpToolSurface {
  const extraDefinitions = getPrincipalCommunicationToolDefinitions();

  return {
    listTools: async () => {
      const baseTools = await args.baseToolSurface.listTools();
      return [...baseTools, ...extraDefinitions];
    },
    executeTool: async (name, params, execution) => {
      if (name === SUBMIT_TASK_TO_SYSTEM_TOOL_NAME) {
        const normalized = SystemTaskSubmissionSchema.parse(params ?? {});
        const receipt = await args.submissionService.submitTask(normalized);
        return success({
          ...receipt,
          systemReplica: args.replicaReader.getReplica(),
        });
      }

      if (name === INJECT_DIRECTIVE_TO_SYSTEM_TOOL_NAME) {
        const normalized = SystemDirectiveInjectionSchema.parse(params ?? {});
        const receipt = await args.submissionService.injectDirective(normalized);
        return success({
          ...receipt,
          systemReplica: args.replicaReader.getReplica(),
        });
      }

      return args.baseToolSurface.executeTool(name, params, execution);
    },
  };
}
