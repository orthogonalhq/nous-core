/**
 * ModelRouter — IModelRouter implementation.
 *
 * Resolves ModelRole to ProviderId using config's modelRoleAssignments.
 * Phase 2.3: routeWithEvidence with profile boundary, capability check, failover.
 */
import { NousError } from '@nous/shared';
import type {
  IModelRouter,
  IConfig,
  ModelRole,
  ProjectId,
  ProviderId,
  ModelProviderConfig,
  RouteContext,
  RouteResult,
  RouteDecisionEvidence,
} from '@nous/shared';
import { ProviderIdSchema, ModelProviderConfigSchema } from '@nous/shared';
import type {
  ModelRoleAssignment,
  Profile,
  ProviderConfigEntry,
} from '@nous/autonomic-config';
import { normalizeProfileName } from '@nous/autonomic-config';
import { isProviderAllowedByProfile } from './profile-boundary.js';

const MAX_FAILOVER_HOPS = 3;

export class ModelRouter implements IModelRouter {
  constructor(private readonly config: IConfig) {
    this.validateConfig();
  }

  async route(role: ModelRole, _projectId?: ProjectId): Promise<ProviderId> {
    const result = await this.routeWithEvidence(role, {
      traceId: '00000000-0000-0000-0000-000000000000' as import('@nous/shared').TraceId,
      modelRequirements: {
        profile: 'review-standard',
        fallbackPolicy: 'block_if_unmet',
      },
    });
    return result.providerId;
  }

  async routeWithEvidence(
    role: ModelRole,
    context: RouteContext
  ): Promise<RouteResult> {
    const configObj = this.config.get() as {
      modelRoleAssignments?: ModelRoleAssignment[];
      providers?: ProviderConfigEntry[];
      profile?: Profile;
    };

    const assignments = configObj.modelRoleAssignments ?? [];
    const providers = configObj.providers ?? [];
    const rawProfile = configObj.profile;
    const profileName = rawProfile
      ? normalizeProfileName(rawProfile.name)
      : 'hybrid_controlled';
    const profile: Profile = rawProfile
      ? { ...rawProfile, name: profileName }
      : {
          name: 'hybrid_controlled',
          description: 'Local preferred with explicit remote fallback.',
          defaultProviderType: 'local',
          allowLocalProviders: true,
          allowRemoteProviders: true,
          allowSilentLocalToRemoteFailover: false,
        };

    const assignment = assignments.find((a) => a.role === role);
    if (!assignment) {
      throw new NousError(
        `No provider assigned for role "${role}"`,
        'ROLE_NOT_ASSIGNED',
      );
    }

    const candidates: { id: ProviderId; isFallback: boolean }[] = [
      { id: assignment.providerId, isFallback: false },
    ];
    if (assignment.fallbackProviderId) {
      candidates.push({ id: assignment.fallbackProviderId, isFallback: true });
    }

    const requiredProfile = context.modelRequirements.profile;

    for (let hop = 0; hop < Math.min(candidates.length, MAX_FAILOVER_HOPS); hop++) {
      const { id: providerId, isFallback } = candidates[hop]!;
      const providerEntry = providers.find((p) => p.id === providerId);
      if (!providerEntry) {
        continue;
      }

      if (!isProviderAllowedByProfile(profile, providerEntry, isFallback)) {
        if (hop === 0) {
          throw new NousError(
            `Profile "${profileName}" excludes provider ${providerId}`,
            'PROVIDER_NOT_FOUND',
            { failoverReasonCode: 'PRV-PROFILE-BOUNDARY' },
          );
        }
        continue;
      }

      if (requiredProfile) {
        const meetsProfiles = providerEntry.meetsProfiles ?? [];
        if (meetsProfiles.length > 0 && !meetsProfiles.includes(requiredProfile)) {
          if (context.principalOverrideEvidence) {
            const idResult = ProviderIdSchema.safeParse(providerId);
            if (idResult.success) {
              return {
                providerId: idResult.data,
                evidence: {
                  profileId: profileName,
                  policyLink: context.modelRequirements.fallbackPolicy,
                  capabilityProfile: requiredProfile,
                  selectedProviderId: idResult.data,
                  failoverHop: hop,
                  failoverReasonCode: 'PRV-PRINCIPAL-OVERRIDE',
                },
              };
            }
          }
          if (hop === candidates.length - 1) {
            throw new NousError(
              `No provider meets capability profile "${requiredProfile}"`,
              'PROVIDER_NOT_FOUND',
              { failoverReasonCode: 'PRV-THRESHOLD-MISS' },
            );
          }
          continue;
        }
      }

      const idResult = ProviderIdSchema.safeParse(providerId);
      if (!idResult.success) {
        continue;
      }

      const evidence: RouteDecisionEvidence = {
        profileId: profileName,
        policyLink: context.modelRequirements.fallbackPolicy,
        capabilityProfile: requiredProfile ?? 'none',
        selectedProviderId: idResult.data,
        failoverHop: hop,
        failoverReasonCode: hop > 0 ? 'PRV-PROVIDER-UNAVAILABLE' : undefined,
      };

      return { providerId: idResult.data, evidence };
    }

    throw new NousError(
      `Failover hop limit (${MAX_FAILOVER_HOPS}) exceeded for role "${role}"`,
      'PROVIDER_NOT_FOUND',
      { failoverReasonCode: 'PRV-HOP-LIMIT' },
    );
  }

  async listProviders(): Promise<ModelProviderConfig[]> {
    const configObj = this.config.get() as {
      providers?: ProviderConfigEntry[];
      profile?: Profile;
    };

    const entries = configObj.providers ?? [];
    const rawProfile = configObj.profile;
    const profileName = rawProfile
      ? normalizeProfileName(rawProfile.name)
      : 'hybrid_controlled';
    const profile: Profile = rawProfile
      ? { ...rawProfile, name: profileName }
      : {
          name: 'hybrid_controlled',
          description: 'Local preferred with explicit remote fallback.',
          defaultProviderType: 'local',
          allowLocalProviders: true,
          allowRemoteProviders: true,
          allowSilentLocalToRemoteFailover: false,
        };

    const result: ModelProviderConfig[] = [];

    for (const entry of entries) {
      const idResult = ProviderIdSchema.safeParse(entry.id);
      if (!idResult.success) continue;

      if (!isProviderAllowedByProfile(profile, entry, false)) {
        continue;
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
        providerClass: entry.providerClass,
        meetsProfiles: entry.meetsProfiles,
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
