'use client'

import type {
  AppInstallConfigFieldDescriptor,
  AppInstallPreparation,
} from '@nous/shared'

export interface InstallWizardDraft {
  config: Record<string, unknown>
  secretFieldKeys: string[]
}

export function getInstallFieldInitialValue(
  field: AppInstallConfigFieldDescriptor,
): unknown {
  if (field.default !== undefined) {
    return field.default
  }

  if (field.type === 'boolean') {
    return false
  }

  if (field.type === 'select') {
    return field.options?.[0] ?? ''
  }

  return ''
}

export function createInstallWizardDraft(
  preparation: AppInstallPreparation,
): InstallWizardDraft {
  const config: Record<string, unknown> = {}
  const secretFieldKeys: string[] = []

  for (const group of preparation.config_groups) {
    for (const field of group.fields) {
      if (field.secret) {
        secretFieldKeys.push(field.key)
        continue
      }
      config[field.key] = getInstallFieldInitialValue(field)
    }
  }

  return {
    config,
    secretFieldKeys,
  }
}

