import { randomUUID } from 'node:crypto';
import type {
  IArtifactStore,
  IEscalationService,
  IModelProvider,
  IModelRouter,
  IProjectApi,
  IToolExecutor,
  MemoryEntry,
  MemoryEntryId,
  MemoryWriteCandidate,
  ModelRole,
  ProjectId,
  ProviderId,
  RetrievalResult,
  TraceId,
} from '@nous/shared';
import type { IScheduler } from '@nous/shared';

interface MwcPipelineLike {
  submit(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<MemoryEntryId | null>;
}

export interface MemoryReadService {
  read(query: string, scope: 'global' | 'project', projectId: ProjectId): Promise<MemoryEntry[]>;
  retrieve(situation: string, budget: number, projectId: ProjectId): Promise<RetrievalResult[]>;
}

export interface GatewayRuntimeProjectApiDeps {
  mwcPipeline: MwcPipelineLike;
  artifactStore: IArtifactStore;
  escalationService: IEscalationService;
  schedulerService: IScheduler;
  toolExecutor: IToolExecutor;
  router: IModelRouter;
  getProvider: (id: ProviderId) => IModelProvider | null;
  memoryReadService?: MemoryReadService | null;
}

export function createGatewayProjectApi(
  projectId: ProjectId,
  deps: GatewayRuntimeProjectApiDeps,
): IProjectApi {
  return {
    memory: {
      read: async (query, scope) => {
        if (deps.memoryReadService) {
          try {
            console.log(`[nous:gateway-runtime] memory.read delegated to live service for project ${projectId}`);
            return await deps.memoryReadService.read(query, scope as 'global' | 'project', projectId);
          } catch {
            return [];
          }
        }
        return [];
      },
      write: async (candidate) => deps.mwcPipeline.submit(candidate, projectId),
      retrieve: async (situation, budget) => {
        if (deps.memoryReadService) {
          try {
            console.log(`[nous:gateway-runtime] memory.retrieve delegated to live service for project ${projectId}`);
            return await deps.memoryReadService.retrieve(situation, budget, projectId);
          } catch {
            return [];
          }
        }
        return [];
      },
    },
    model: {
      invoke: async (role: ModelRole, input: unknown) => {
        const traceId = randomUUID() as TraceId;
        const route = await deps.router.routeWithEvidence(role, {
          projectId,
          traceId,
          modelRequirements: {
            profile: 'review-standard',
            fallbackPolicy: 'block_if_unmet',
          },
        });
        const provider = deps.getProvider(route.providerId);
        if (!provider) {
          throw new Error(`Provider ${route.providerId} not found`);
        }
        return provider.invoke({ role, input, projectId, traceId });
      },
      stream: async function* (role: ModelRole, input: unknown) {
        const traceId = randomUUID() as TraceId;
        const route = await deps.router.routeWithEvidence(role, {
          projectId,
          traceId,
          modelRequirements: {
            profile: 'review-standard',
            fallbackPolicy: 'block_if_unmet',
          },
        });
        const provider = deps.getProvider(route.providerId);
        if (!provider) {
          throw new Error(`Provider ${route.providerId} not found`);
        }
        yield* provider.stream({ role, input, projectId, traceId });
      },
    },
    tool: {
      execute: async (name, params) => deps.toolExecutor.execute(name, params, projectId),
      list: async (capabilities) => {
        const tools = await deps.toolExecutor.listTools();
        if (!capabilities || capabilities.length === 0) {
          return tools;
        }
        return tools.filter((tool) =>
          capabilities.every((capability) => tool.capabilities.includes(capability)),
        );
      },
    },
    artifact: {
      store: async (data) => deps.artifactStore.store({ ...data, projectId }),
      retrieve: async (request) => deps.artifactStore.retrieve({ ...request, projectId }),
      list: async (filters) => deps.artifactStore.list(projectId, filters),
      delete: async (request) => deps.artifactStore.delete({ ...request, projectId }),
    },
    escalation: {
      notify: async (channel, message) =>
        deps.escalationService.notify({
          projectId,
          channel,
          priority: 'medium',
          timestamp: new Date().toISOString(),
          triggerReason: 'gateway_runtime_notify',
          requiredAction: 'Gateway runtime escalation',
          context: message,
        }),
      request: async (decision) => {
        const escalationId = await deps.escalationService.notify(decision);
        return {
          escalationId,
          action: 'notified',
          message: decision.context,
          respondedAt: new Date().toISOString(),
          channel: decision.channel,
        };
      },
    },
    scheduler: {
      register: async (schedule) =>
        deps.schedulerService.register({ ...schedule, projectId }),
      cancel: async (id) => deps.schedulerService.cancel(id),
    },
    project: {
      config: () =>
        ({
          id: projectId,
          name: `Project ${projectId}`,
          type: 'software_project',
          pfcTier: 'standard',
          governanceDefaults: {
            defaultNodeGovernance: 'must',
            requireExplicitReviewForShouldDeviation: true,
            blockedActionFeedbackMode: 'reason_coded',
          },
          modelAssignments: undefined,
          memoryAccessPolicy: {
            globalRead: [],
            globalWrite: [],
            projectPolicies: [],
            defaultPolicy: {
              canReadFrom: ['self'],
              canBeReadBy: ['self'],
              inheritsGlobal: true,
            },
          },
          escalationChannels: ['in_app'],
          escalationPreferences: {
            routeByPriority: {
              low: ['projects'],
              medium: ['projects'],
              high: ['projects', 'chat', 'mobile'],
              critical: ['projects', 'chat', 'mao', 'mobile'],
            },
            acknowledgementSurfaces: ['projects', 'chat', 'mobile'],
            mirrorToChat: true,
          },
          workflow: {
            definitions: [],
          },
          packageDefaultIntake: [],
          retrievalBudgetTokens: 500,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }) as any,
      state: () =>
        ({
          status: 'active',
          activeWorkflows: 0,
          lastActivityAt: new Date().toISOString(),
        }) as any,
      log: () => undefined,
    },
  };
}
