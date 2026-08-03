import type { CliExecutionCapabilityProfile, ModelRole } from '@nous/shared';
import type { ProviderDefinition } from '@nous/subcortex-providers';

export interface RoleCompatibilityResult {
  readonly selectable: boolean;
  readonly reason?: string;
  readonly executionCapabilityProfile?: CliExecutionCapabilityProfile;
  readonly requiredExecutionCapabilityProfile?: CliExecutionCapabilityProfile;
}

const CORTEX_PERSISTENT_CHAT_REQUIREMENT: CliExecutionCapabilityProfile = 'persistent_process';

const MODEL_ROLE_EXECUTION_REQUIREMENTS: Partial<Record<ModelRole, CliExecutionCapabilityProfile>> = {
  'cortex-chat': CORTEX_PERSISTENT_CHAT_REQUIREMENT,
  'cortex-system': CORTEX_PERSISTENT_CHAT_REQUIREMENT,
};

const EXECUTION_CAPABILITY_RANK: Record<CliExecutionCapabilityProfile, number> = {
  one_shot_command: 0,
  session_bound_command: 1,
  persistent_process: 2,
};

export function roleCompatibilityForProviderDefinition(
  role: ModelRole,
  definition: ProviderDefinition,
): RoleCompatibilityResult {
  const requiredExecutionCapabilityProfile = MODEL_ROLE_EXECUTION_REQUIREMENTS[role];
  const executionCapabilityProfile = definition.executionCapabilityProfile;

  if (!requiredExecutionCapabilityProfile || definition.protocol !== 'agent-cli') {
    return {
      selectable: true,
      ...(executionCapabilityProfile ? { executionCapabilityProfile } : {}),
    };
  }

  const actualProfile = executionCapabilityProfile ?? 'one_shot_command';
  const compatible = EXECUTION_CAPABILITY_RANK[actualProfile] >=
    EXECUTION_CAPABILITY_RANK[requiredExecutionCapabilityProfile];

  if (compatible) {
    return {
      selectable: true,
      executionCapabilityProfile: actualProfile,
      requiredExecutionCapabilityProfile,
    };
  }

  return {
    selectable: false,
    executionCapabilityProfile: actualProfile,
    requiredExecutionCapabilityProfile,
    reason:
      `${definition.displayName} declares ${actualProfile}, but ${role} requires ` +
      `${requiredExecutionCapabilityProfile} for persistent Cortex chat.`,
  };
}

export function roleCompatibilityMapForProviderDefinition(
  definition: ProviderDefinition,
  roles: readonly ModelRole[],
): Partial<Record<ModelRole, RoleCompatibilityResult>> {
  return Object.fromEntries(
    roles.map((role) => [role, roleCompatibilityForProviderDefinition(role, definition)]),
  ) as Partial<Record<ModelRole, RoleCompatibilityResult>>;
}

export function assertProviderDefinitionCompatibleWithRole(
  role: ModelRole,
  definition: ProviderDefinition,
): void {
  const compatibility = roleCompatibilityForProviderDefinition(role, definition);
  if (compatibility.selectable) return;

  throw new Error(compatibility.reason ?? `${definition.displayName} is not compatible with ${role}.`);
}
