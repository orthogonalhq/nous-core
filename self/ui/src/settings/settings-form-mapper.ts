'use client'

import type {
  AppSettingsPreparation,
  AppSettingsSecretMutation,
} from '@nous/shared'
import { getInstallFieldInitialValue } from '../install/install-form-mapper'

export interface AppSettingsDraft {
  config: Record<string, unknown>
  secrets: Record<string, AppSettingsSecretMutation>
}

export function createAppSettingsDraft(
  preparation: AppSettingsPreparation,
): AppSettingsDraft {
  const config: Record<string, unknown> = {}
  const secrets: Record<string, AppSettingsSecretMutation> = {}

  for (const group of preparation.config_groups) {
    for (const field of group.fields) {
      if (field.secret) {
        secrets[field.key] = { operation: 'retain' }
        continue
      }

      config[field.key] =
        field.value !== undefined
          ? field.value
          : getInstallFieldInitialValue(field)
    }
  }

  return {
    config,
    secrets,
  }
}
