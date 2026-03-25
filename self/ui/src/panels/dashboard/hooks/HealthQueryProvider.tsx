import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type {
  SystemStatusSnapshot,
  ProviderHealthSnapshot,
  AgentStatusSnapshot,
} from '@nous/shared'

/**
 * Plain async fetcher functions for each health endpoint.
 * The web app host provides concrete tRPC-backed implementations;
 * `@nous/ui` widgets consume these without importing `@trpc/react-query`.
 */
export type HealthFetchers = {
  fetchSystemStatus: () => Promise<SystemStatusSnapshot>
  fetchProviderHealth: () => Promise<ProviderHealthSnapshot>
  fetchAgentStatus: () => Promise<AgentStatusSnapshot>
}

const HealthQueryContext = createContext<HealthFetchers | null>(null)

export function HealthQueryProvider({
  fetchers,
  children,
}: {
  fetchers: HealthFetchers
  children: ReactNode
}) {
  return (
    <HealthQueryContext.Provider value={fetchers}>
      {children}
    </HealthQueryContext.Provider>
  )
}

/**
 * Access health fetcher functions provided by the host application.
 * Must be called within a `<HealthQueryProvider>`.
 */
export function useHealthQueries(): HealthFetchers {
  const ctx = useContext(HealthQueryContext)
  if (ctx === null) {
    throw new Error(
      'useHealthQueries must be used within a <HealthQueryProvider>. ' +
        'Wrap your component tree with <HealthQueryProvider fetchers={...}>.',
    )
  }
  return ctx
}
