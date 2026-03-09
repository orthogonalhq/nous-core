import type {
  IKnowledgeIndex,
  ToolDefinition,
  ToolResult,
} from '@nous/shared';
import { ProjectDiscoveryRequestSchema } from '@nous/shared';

export class DiscoverProjectsTool {
  constructor(private readonly knowledgeIndex: IKnowledgeIndex) {}

  getDefinition(): ToolDefinition {
    return {
      name: 'discover_projects',
      version: '1.0.0',
      description: 'Runs policy-filtered cross-project discovery for an operator query',
      inputSchema: {
        type: 'object',
        properties: {
          requestingProjectId: { type: 'string', format: 'uuid' },
          query: { type: 'string' },
          topK: { type: 'number' },
          includeMetaVector: { type: 'boolean' },
          includeTaxonomy: { type: 'boolean' },
          includeRelationships: { type: 'boolean' },
          traceId: { type: 'string', format: 'uuid' },
        },
        required: ['requestingProjectId', 'query'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          discovery: { type: 'object' },
          policy: { type: 'object' },
          snapshot: { type: 'object', nullable: true },
        },
      },
      capabilities: ['read'],
      permissionScope: 'project:read',
    };
  }

  async execute(params: unknown): Promise<ToolResult> {
    const startedAt = Date.now();
    try {
      const request = ProjectDiscoveryRequestSchema.parse(params);
      const output = await this.knowledgeIndex.discoverProjects(request);
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
