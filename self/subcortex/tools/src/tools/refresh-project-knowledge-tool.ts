import type { IKnowledgeIndex, ToolDefinition, ToolResult } from '@nous/shared';
import { ProjectKnowledgeRefreshRequestSchema } from '@nous/shared';

export class RefreshProjectKnowledgeTool {
  constructor(private readonly knowledgeIndex: IKnowledgeIndex) {}

  getDefinition(): ToolDefinition {
    return {
      name: 'refresh_project_knowledge',
      version: '1.0.0',
      description: 'Refreshes canonical project knowledge projections',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', format: 'uuid' },
          trigger: { type: 'string', enum: ['manual', 'workflow', 'schedule'] },
          reasonCode: { type: 'string' },
          requestedAt: { type: 'string', format: 'date-time' },
          traceId: { type: 'string', format: 'uuid' },
          workflowRunId: { type: 'string', format: 'uuid' },
          dispatchLineageId: { type: 'string', format: 'uuid' },
          scheduleId: { type: 'string', format: 'uuid' },
        },
        required: ['projectId', 'trigger', 'reasonCode', 'requestedAt'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          outcome: { type: 'string' },
          projectId: { type: 'string', format: 'uuid' },
        },
      },
      capabilities: ['write'],
      permissionScope: 'project:write',
    };
  }

  async execute(params: unknown): Promise<ToolResult> {
    const startedAt = Date.now();
    try {
      const request = ProjectKnowledgeRefreshRequestSchema.parse(params);
      const output = await this.knowledgeIndex.refreshProjectKnowledge(request);
      return {
        success: true,
        output,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
