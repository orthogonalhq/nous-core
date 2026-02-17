/**
 * CLI command behavior tests.
 * Uses mocked tRPC client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSend } from '../commands/send.js';
import {
  runProjectsList,
  runProjectsCreate,
  runProjectsSwitch,
} from '../commands/projects.js';
import { runConfigGet, runConfigSet } from '../commands/config.js';
import type { CliTrpcClient } from '../trpc-client.js';

function createMockClient(): CliTrpcClient {
  return {
    chat: {
      sendMessage: {
        mutate: vi.fn(),
      },
    },
    projects: {
      list: { query: vi.fn() },
      create: { mutate: vi.fn() },
      get: { query: vi.fn() },
    },
    config: {
      get: { query: vi.fn() },
      update: { mutate: vi.fn() },
    },
  } as unknown as CliTrpcClient;
}

describe('CLI commands', () => {
  let mockClient: CliTrpcClient;
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  it('send displays response to stdout', async () => {
    vi.mocked(mockClient.chat.sendMessage.mutate).mockResolvedValue({
      response: 'Hello from mock',
      traceId: 'trace-123' as import('@nous/shared').TraceId,
    });

    const code = await runSend(mockClient, 'hello');
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith('Hello from mock');
  });

  it('send returns 1 on connection error', async () => {
    vi.mocked(mockClient.chat.sendMessage.mutate).mockRejectedValue(
      new Error('fetch failed ECONNREFUSED'),
    );

    const code = await runSend(mockClient, 'hello');
    expect(code).toBe(1);
    expect(consoleSpy.error).toHaveBeenCalledWith(
      'Cannot connect to Nous. Is the backend running? Start with: pnpm dev:web',
    );
  });

  it('projects list prints table', async () => {
    vi.mocked(mockClient.projects.list.query).mockResolvedValue([
      {
        id: 'proj-1' as import('@nous/shared').ProjectId,
        name: 'Test Project',
        type: 'hybrid',
      },
    ]);

    const code = await runProjectsList(mockClient);
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('proj-1'),
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('Test Project'),
    );
  });

  it('projects list shows message when empty', async () => {
    vi.mocked(mockClient.projects.list.query).mockResolvedValue([]);

    const code = await runProjectsList(mockClient);
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('No projects'),
    );
  });

  it('projects create prints created project', async () => {
    vi.mocked(mockClient.projects.create.mutate).mockResolvedValue({
      id: 'new-id' as import('@nous/shared').ProjectId,
      name: 'New Project',
    });

    const code = await runProjectsCreate(mockClient, 'New Project');
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('Created project'),
    );
  });

  it('projects switch prints project when found', async () => {
    vi.mocked(mockClient.projects.get.query).mockResolvedValue({
      id: 'proj-1' as import('@nous/shared').ProjectId,
      name: 'My Project',
    });

    const code = await runProjectsSwitch(mockClient, 'proj-1');
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('My Project'),
    );
  });

  it('projects switch returns 1 when project not found', async () => {
    vi.mocked(mockClient.projects.get.query).mockResolvedValue(null);

    const code = await runProjectsSwitch(mockClient, 'bad-id');
    expect(code).toBe(1);
    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.stringContaining('Project not found'),
    );
  });

  it('config get prints config', async () => {
    vi.mocked(mockClient.config.get.query).mockResolvedValue({
      pfcTier: 3,
      modelRoleAssignments: [],
    });

    const code = await runConfigGet(mockClient, false);
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith('PFC Tier:', 3);
  });

  it('config get prints JSON when json flag', async () => {
    const config = { pfcTier: 2, modelRoleAssignments: [] };
    vi.mocked(mockClient.config.get.query).mockResolvedValue(config);

    const code = await runConfigGet(mockClient, true);
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('"pfcTier"'),
    );
  });

  it('config set updates pfc tier', async () => {
    vi.mocked(mockClient.config.update.mutate).mockResolvedValue(undefined);

    const code = await runConfigSet(mockClient, { pfcTier: 4 });
    expect(code).toBe(0);
    expect(consoleSpy.log).toHaveBeenCalledWith('Updated PFC tier to', 4);
  });
});
