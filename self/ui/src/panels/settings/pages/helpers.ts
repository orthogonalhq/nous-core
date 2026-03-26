import type {
  PreferencesApi,
  Provider,
  FeedbackState,
  ModelRole,
  AvailableModel,
  HydratedRoleAssignmentDisplayEntry,
  RoleAssignmentState,
  PendingRoleAssignments,
  RoleAssignmentDisplayEntry,
} from '../types'
import { MODEL_ROLES } from '../types'
import { PROVIDER_LABELS } from '../styles'

export async function testStoredProviderKey(
  api: PreferencesApi,
  provider: Provider,
): Promise<FeedbackState> {
  const result = await api.testApiKey({ provider })
  if (result.valid) {
    return {
      message: `${PROVIDER_LABELS[provider]} API key is valid.`,
      success: true,
    }
  }

  return {
    message: result.error ?? `${PROVIDER_LABELS[provider]} API key test failed.`,
    success: false,
  }
}

export function formatFeedbackError(error: unknown): FeedbackState {
  const message = error instanceof Error ? error.message : String(error)
  return {
    message: `Error: ${message}`,
    success: false,
  }
}

export function isModelRole(role: string): role is ModelRole {
  return MODEL_ROLES.some((value) => value === role)
}

export function buildEmptyRoleAssignments(): RoleAssignmentState {
  return MODEL_ROLES.reduce<RoleAssignmentState>((result, role) => {
    result[role] = {
      role,
      providerId: null,
      displayName: null,
      modelSpec: null,
    }
    return result
  }, {} as RoleAssignmentState)
}

export function buildPendingRoleAssignments(
  roleAssignments: RoleAssignmentState,
): PendingRoleAssignments {
  return MODEL_ROLES.reduce<PendingRoleAssignments>((result, role) => {
    result[role] = roleAssignments[role].modelSpec ?? ''
    return result
  }, {} as PendingRoleAssignments)
}

export function normalizeRoleAssignmentEntries(
  entries: RoleAssignmentDisplayEntry[],
): RoleAssignmentState {
  const next = buildEmptyRoleAssignments()

  for (const entry of entries as HydratedRoleAssignmentDisplayEntry[]) {
    if (!isModelRole(entry.role)) {
      continue
    }

    next[entry.role] = {
      role: entry.role,
      providerId: entry.providerId ?? null,
      displayName: entry.displayName ?? null,
      modelSpec: entry.modelSpec ?? null,
    }
  }

  return next
}

export function buildModelsByProvider(
  models: AvailableModel[],
): Record<string, AvailableModel[]> {
  return models.reduce<Record<string, AvailableModel[]>>((result, model) => {
    const group = result[model.provider] ?? []
    group.push(model)
    result[model.provider] = group
    return result
  }, {})
}

export function getModelOptionLabel(model: AvailableModel): string {
  return model.available ? model.name : `${model.name} (cached)`
}

export function getRoleAssignmentDisplay(
  entry: HydratedRoleAssignmentDisplayEntry,
  models: AvailableModel[],
): string {
  if (entry.modelSpec) {
    const matchingModel = models.find((model) => model.id === entry.modelSpec)
    return matchingModel?.name ?? entry.displayName ?? entry.modelSpec
  }

  if (entry.displayName) {
    return entry.displayName
  }

  if (entry.providerId) {
    return entry.providerId
  }

  return 'Not assigned'
}

export function buildChangedRoleAssignments(
  roleAssignments: RoleAssignmentState,
  pendingRoleAssignments: PendingRoleAssignments,
): Array<{ role: ModelRole; modelSpec: string }> {
  return MODEL_ROLES.flatMap((role) => {
    const currentModelSpec = roleAssignments[role].modelSpec ?? ''
    const nextModelSpec = pendingRoleAssignments[role]

    if (!nextModelSpec || nextModelSpec === currentModelSpec) {
      return []
    }

    return [{ role, modelSpec: nextModelSpec }]
  })
}
