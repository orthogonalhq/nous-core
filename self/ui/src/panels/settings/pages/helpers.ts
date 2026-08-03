import type {
  PreferencesApi,
  Provider,
  FeedbackState,
  AvailableModel,
} from '../types'

export async function testStoredProviderKey(
  api: PreferencesApi,
  provider: Provider,
  providerLabel = provider,
): Promise<FeedbackState> {
  const result = await api.testApiKey({ provider })
  if (result.valid) {
    return {
      message: `${providerLabel} API key is valid.`,
      success: true,
    }
  }

  return {
    message: result.error ?? `${providerLabel} API key test failed.`,
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
