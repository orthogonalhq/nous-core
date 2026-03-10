import { describe, expect, it, vi } from 'vitest';
import type { IKnowledgeIndex } from '@nous/shared';
import {
  ProjectDiscoveryResultSchema,
  ProjectKnowledgeRefreshRecordSchema,
} from '@nous/shared';
import { DiscoverProjectsTool } from '../tools/discover-projects-tool.js';
import { RefreshProjectKnowledgeTool } from '../tools/refresh-project-knowledge-tool.js';

describe('knowledge tools', () => {
  it('discover_projects delegates to the knowledge index runtime', async () => {
    const knowledgeIndex: IKnowledgeIndex = {
      refreshProjectKnowledge: vi.fn(),
      getProjectSnapshot: vi.fn(),
      discoverProjects: vi.fn(async () => ProjectDiscoveryResultSchema.parse({
        discovery: {
          version: '1.0',
          exportedAt: '2026-03-09T16:30:00.000Z',
          requestingProjectId: '550e8400-e29b-41d4-a716-446655440801' as any,
          projectIds: [],
          results: [],
          audit: {
            traceId: '550e8400-e29b-41d4-a716-446655440803' as any,
            projectIdsDiscovered: [],
            metaVectorCount: 0,
            taxonomyCount: 0,
            relationshipCount: 0,
            mergeStrategy: 'test',
          },
        },
        policy: {
          deniedProjectCount: 0,
          reasonCodes: [],
        },
        snapshot: null,
      })),
    };

    const tool = new DiscoverProjectsTool(knowledgeIndex);
    const result = await tool.execute({
      requestingProjectId: '550e8400-e29b-41d4-a716-446655440801',
      query: 'release notes',
    });

    expect(result.success).toBe(true);
    expect(vi.mocked(knowledgeIndex.discoverProjects)).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'release notes' }),
    );
  });

  it('refresh_project_knowledge delegates to the knowledge index runtime', async () => {
    const knowledgeIndex: IKnowledgeIndex = {
      refreshProjectKnowledge: vi.fn(async () => ProjectKnowledgeRefreshRecordSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440802',
        projectId: '550e8400-e29b-41d4-a716-446655440801' as any,
        trigger: 'workflow',
        reasonCode: 'workflow_tool_refresh',
        inputDigest: 'a'.repeat(64),
        outcome: 'updated',
        metaVectorState: 'updated',
        taxonomyTagCount: 1,
        relationship: {
          projectId: '550e8400-e29b-41d4-a716-446655440801' as any,
          edgesCreated: 0,
          edgesUpdated: 0,
          edgesInvalidated: 0,
          evidenceRefs: [],
        },
        evidenceRefs: [],
        sourcePatternIds: [],
        startedAt: '2026-03-09T16:30:00.000Z',
        completedAt: '2026-03-09T16:30:00.000Z',
      })),
      getProjectSnapshot: vi.fn(),
      discoverProjects: vi.fn(),
    };

    const tool = new RefreshProjectKnowledgeTool(knowledgeIndex);
    const result = await tool.execute({
      projectId: '550e8400-e29b-41d4-a716-446655440801',
      trigger: 'workflow',
      reasonCode: 'workflow_tool_refresh',
      requestedAt: '2026-03-09T16:30:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(vi.mocked(knowledgeIndex.refreshProjectKnowledge)).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'workflow' }),
    );
  });
});
