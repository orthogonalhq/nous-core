/**
 * AppRouter type for CLI tRPC client.
 * Mirrors the procedures from @nous/web server.
 * TODO: Import from shared package when router is extracted.
 */
import type { ProjectId, TraceId } from '@nous/shared';

export type AppRouter = {
  chat: {
    sendMessage: {
      mutate: (input: {
        message: string;
        projectId?: ProjectId;
      }) => Promise<{ response: string; traceId: TraceId }>;
    };
  };
  projects: {
    list: { query: () => Promise<Array<{ id: ProjectId; name: string; type: string }>> };
    create: { mutate: (input: { name: string; type?: string }) => Promise<{ id: ProjectId; name: string }> };
    get: { query: (input: { id: ProjectId }) => Promise<{ id: ProjectId; name: string } | null> };
  };
  config: {
    get: { query: () => Promise<{ pfcTier: number; modelRoleAssignments?: Array<{ role: string; providerId: string }> }> };
    update: { mutate: (input: { pfcTier?: number }) => Promise<void> };
  };
};
