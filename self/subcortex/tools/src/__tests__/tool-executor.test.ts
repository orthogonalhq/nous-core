import { describe, it, expect } from 'vitest';
import { ToolExecutor } from '../tool-executor.js';
import { DiscoverProjectsTool } from '../tools/discover-projects-tool.js';

describe('ToolExecutor', () => {
  it('implements IToolExecutor — execute echo returns ToolResult', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('echo', { message: 'hello' });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ echoed: 'hello' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('execute() with invalid params returns success false', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('echo', { wrong: 'params' });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('execute() with missing message returns success false', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('echo', {});

    expect(result.success).toBe(false);
  });

  it('execute() with unknown tool returns success false', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('unknown', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('listTools() includes echo', async () => {
    const executor = new ToolExecutor();
    const tools = await executor.listTools();

    expect(tools.some((t) => t.name === 'echo')).toBe(true);
    const echo = tools.find((t) => t.name === 'echo');
    expect(echo?.capabilities).toContain('read');
  });

  it('supports dependency-bound tool registration', async () => {
    const executor = new ToolExecutor([
      new DiscoverProjectsTool({
        async refreshProjectKnowledge() {
          throw new Error('not used');
        },
        async getProjectSnapshot() {
          return null;
        },
        async discoverProjects() {
          return {
            discovery: {
              version: '1.0',
              exportedAt: '2026-03-09T16:30:00.000Z',
              requestingProjectId: '550e8400-e29b-41d4-a716-446655440805' as any,
              projectIds: [],
              results: [],
              audit: {
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
          };
        },
      }),
    ]);
    const result = await executor.execute('discover_projects', {
      requestingProjectId: '550e8400-e29b-41d4-a716-446655440805',
      query: 'release notes',
    });

    expect(result.success).toBe(true);
  });
});
