import type {
  PreferencesApi,
  Provider,
  FeedbackState,
  AvailableModel,
} from '../types'
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
