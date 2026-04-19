import { randomUUID } from 'node:crypto';
import {
  ProjectConfigSchema,
  ScheduleUpsertInputSchema,
  type ProjectConfig,
  type ProjectId,
  type ScheduleUpsertInput,
} from '@nous/shared';

export function createProjectConfig(
  overrides: Partial<ProjectConfig> = {},
): ProjectConfig {
  const now = new Date().toISOString();

  return ProjectConfigSchema.parse({
    id: overrides.id ?? (randomUUID() as ProjectId),
    name: overrides.name ?? 'Test Project',
    type: overrides.type ?? 'hybrid',
    pfcTier: overrides.pfcTier ?? 3,
    governanceDefaults: overrides.governanceDefaults,
    modelAssignments: overrides.modelAssignments,
    memoryAccessPolicy: overrides.memoryAccessPolicy ?? {
      canReadFrom: 'all',
      canBeReadBy: 'all',
      inheritsGlobal: true,
    },
    escalationChannels: overrides.escalationChannels ?? ['in-app'],
    escalationPreferences: overrides.escalationPreferences,
    workflow: overrides.workflow,
    packageDefaultIntake: overrides.packageDefaultIntake,
    retrievalBudgetTokens: overrides.retrievalBudgetTokens ?? 500,
    budgetPolicy: overrides.budgetPolicy,
    description: overrides.description,
    icon: overrides.icon,
    iconColor: overrides.iconColor,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  });
}

export function createScheduleUpsertInput(
  overrides: Partial<ScheduleUpsertInput> &
    Pick<ScheduleUpsertInput, 'projectId' | 'trigger'>,
): ScheduleUpsertInput {
  return ScheduleUpsertInputSchema.parse({
    enabled: true,
    requestedDeliveryMode: 'none',
    ...overrides,
  });
}
