/**
 * ModelRouter — IModelRouter implementation.
 *
 * Resolves ModelRole to ProviderId using config's modelRoleAssignments.
 * Applies profile filter (local-only, remote-only, hybrid).
 */
import { NousError } from '@nous/shared';
import type {
  IModelRouter,
  IConfig,
  ModelRole,
  ProjectId,
  ProviderId,
  ModelProviderConfig,
} from '@nous/shared';
import { ProviderIdSchema, ModelProviderConfigSchema } from '@nous/shared';
import type { ModelRoleAssignment, Profile, ProviderConfigEntry } from '@nous/autonomic-config';

export class ModelRouter implements IModelRouter {
  constructor(private readonly config: IConfig) {
    this.validateConfig();
  }

  async route(role: ModelRole, _projectId?: ProjectId): Promise<ProviderId> {
    const configObj = this.config.get() as {
      modelRoleAssignments?: ModelRoleAssignment[];
      providers?: ProviderConfigEntry[];
      profile?: Profile;
    };

    const assignments = configObj.modelRoleAssignments ?? [];
    const providers = configObj.providers ?? [];
    const profile = configObj.profile;

    const assignment = assignments.find((a) => a.role === role);
    if (!assignment) {
      console.warn(`[nous:router] No assignment for role=${role}`);
      throw new NousError(
        `No provider assigned for role "${role}"`,
        'ROLE_NOT_ASSIGNED',
      );
    }

    const providerId = assignment.providerId;
    const providerEntry = providers.find((p) => p.id === providerId);
    if (!providerEntry) {
      console.warn(`[nous:router] Provider ${providerId} not in config`);
      throw new NousError(
        `Provider ${providerId} not found in configuration`,
        'PROVIDER_NOT_FOUND',
      );
    }

    // Apply profile filter
    if (profile) {
      if (profile.name === 'local-only' && !providerEntry.isLocal) {
        throw new NousError(
          `Profile "local-only" excludes remote provider ${providerId}`,
          'PROVIDER_NOT_FOUND',
        );
      }
      if (profile.name === 'remote-only' && providerEntry.isLocal) {
        throw new NousError(
          `Profile "remote-only" excludes local provider ${providerId}`,
          'PROVIDER_NOT_FOUND',
        );
      }
    }

    console.info(
      `[nous:router] route role=${role} providerId=${providerId}`,
    );

    const idResult = ProviderIdSchema.safeParse(providerId);
    if (!idResult.success) {
      throw new NousError(
        `Provider id "${providerId}" is not a valid UUID`,
        'PROVIDER_NOT_FOUND',
      );
    }

    return idResult.data;
  }

  async listProviders(): Promise<ModelProviderConfig[]> {
    const configObj = this.config.get() as {
      providers?: ProviderConfigEntry[];
      profile?: Profile;
    };

    const entries = configObj.providers ?? [];
    const profile = configObj.profile;

    const result: ModelProviderConfig[] = [];

    for (const entry of entries) {
      const idResult = ProviderIdSchema.safeParse(entry.id);
      if (!idResult.success) continue;

      if (profile) {
        if (profile.name === 'local-only' && !entry.isLocal) continue;
        if (profile.name === 'remote-only' && entry.isLocal) continue;
      }

      const providerConfig: ModelProviderConfig = {
        id: idResult.data,
        name: entry.name,
        type: entry.type,
        endpoint: entry.endpoint,
        modelId: entry.modelId,
        isLocal: entry.isLocal,
        maxTokens: entry.maxTokens,
        capabilities: entry.capabilities ?? [],
      };

      const validated = ModelProviderConfigSchema.safeParse(providerConfig);
      if (validated.success) {
        result.push(validated.data);
      }
    }

    return result;
  }

  private validateConfig(): void {
    const configObj = this.config.get() as {
      modelRoleAssignments?: ModelRoleAssignment[];
      providers?: ProviderConfigEntry[];
    };

    const assignments = configObj.modelRoleAssignments ?? [];
    const providers = configObj.providers ?? [];

    for (const assignment of assignments) {
      const idResult = ProviderIdSchema.safeParse(assignment.providerId);
      if (!idResult.success) {
        throw new NousError(
          `Provider id "${assignment.providerId}" is not a valid UUID`,
          'PROVIDER_NOT_FOUND',
        );
      }
    }

    for (const entry of providers) {
      const idResult = ProviderIdSchema.safeParse(entry.id);
      if (!idResult.success) {
        throw new NousError(
          `Provider id "${entry.id}" is not a valid UUID`,
          'PROVIDER_NOT_FOUND',
        );
      }
    }
  }
}
