import { useMemo, useRef } from 'react'
import { trpc } from '../client'

/**
 * tRPC-backed preferences API hook.
 *
 * Returns a referentially stable object structurally compatible with
 * PreferencesApi from @nous/ui/panels/settings/types.
 *
 * Does NOT import PreferencesApi — structural compatibility only.
 * This respects the dependency direction: transport does not depend on ui.
 */
export function usePreferencesApi() {
  const utils = trpc.useUtils()
  const setApiKey = trpc.preferences.setApiKey.useMutation()
  const deleteApiKey = trpc.preferences.deleteApiKey.useMutation()
  const testApiKey = trpc.preferences.testApiKey.useMutation()
  const setRoleAssignment = trpc.preferences.setRoleAssignment.useMutation()
  const resetWizardMutation = trpc.firstRun.resetWizard.useMutation()
  const pullOllamaModel = trpc.ollama.pullModel.useMutation()
  const deleteOllamaModel = trpc.ollama.deleteModel.useMutation()
  const setOllamaEndpoint = trpc.ollama.setEndpoint.useMutation()

  const utilsRef = useRef(utils)
  utilsRef.current = utils
  const setApiKeyRef = useRef(setApiKey.mutateAsync)
  setApiKeyRef.current = setApiKey.mutateAsync
  const deleteApiKeyRef = useRef(deleteApiKey.mutateAsync)
  deleteApiKeyRef.current = deleteApiKey.mutateAsync
  const testApiKeyRef = useRef(testApiKey.mutateAsync)
  testApiKeyRef.current = testApiKey.mutateAsync
  const setRoleAssignmentRef = useRef(setRoleAssignment.mutateAsync)
  setRoleAssignmentRef.current = setRoleAssignment.mutateAsync
  const resetWizardRef = useRef(resetWizardMutation.mutateAsync)
  resetWizardRef.current = resetWizardMutation.mutateAsync
  const pullOllamaModelRef = useRef(pullOllamaModel.mutateAsync)
  pullOllamaModelRef.current = pullOllamaModel.mutateAsync
  const deleteOllamaModelRef = useRef(deleteOllamaModel.mutateAsync)
  deleteOllamaModelRef.current = deleteOllamaModel.mutateAsync
  const setOllamaEndpointRef = useRef(setOllamaEndpoint.mutateAsync)
  setOllamaEndpointRef.current = setOllamaEndpoint.mutateAsync

  return useMemo(
    () => ({
      // Required methods
      getApiKeys: async () => {
        return utilsRef.current.preferences.getApiKeys.fetch()
      },
      setApiKey: async (input: { provider: string; key: string }) => {
        return setApiKeyRef.current(input as any)
      },
      deleteApiKey: async (input: { provider: string }) => {
        return deleteApiKeyRef.current(input as any)
      },
      testApiKey: async (input: { provider: string; key?: string }) => {
        return testApiKeyRef.current(input as any)
      },
      getSystemStatus: async () => {
        return utilsRef.current.preferences.getSystemStatus.fetch()
      },
      // Optional methods (all provided — wired to existing tRPC endpoints)
      getAvailableModels: async () => {
        return utilsRef.current.preferences.getAvailableModels.fetch()
      },
      getRoleAssignments: async () => {
        const record = await utilsRef.current.preferences.getRoleAssignments.fetch()
        return Object.entries(record).map(([role, assignment]) => ({
          role,
          providerId: (assignment as any)?.providerId ?? null,
        }))
      },
      setRoleAssignment: async (input: { role: string; modelSpec: string }) => {
        return setRoleAssignmentRef.current(input as any)
      },
      // Setup wizard
      resetWizard: async () => {
        return resetWizardRef.current()
      },
      // Ollama model management
      listOllamaModels: async () => {
        return utilsRef.current.ollama.listModels.fetch()
      },
      pullOllamaModel: async (name: string) => {
        return pullOllamaModelRef.current({ model: name })
      },
      deleteOllamaModel: async (name: string) => {
        return deleteOllamaModelRef.current({ name })
      },
      // Ollama endpoint configuration
      getOllamaEndpoint: async () => {
        return utilsRef.current.ollama.getEndpoint.fetch()
      },
      setOllamaEndpoint: async (endpoint: string | null) => {
        return setOllamaEndpointRef.current({ endpoint })
      },
    }),
    // No dependencies — object is created once per mount.
    // Mutation handles and utils are accessed via refs for latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
}
