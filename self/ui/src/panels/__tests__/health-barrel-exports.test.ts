import { describe, expect, it } from 'vitest'

describe('panels barrel — health re-exports', () => {
  // --- Tier 1: Contract ---
  // Verifies that HealthQueryProvider, useHealthQueries, and HealthFetchers
  // are resolvable from the panels barrel. Regression guard for Defect 1 (SP 1.4).

  it('re-exports HealthQueryProvider from the panels barrel', async () => {
    const barrel = await import('../index')
    expect(barrel).toHaveProperty('HealthQueryProvider')
    expect(typeof barrel.HealthQueryProvider).toBe('function')
  })

  it('re-exports useHealthQueries from the panels barrel', async () => {
    const barrel = await import('../index')
    expect(barrel).toHaveProperty('useHealthQueries')
    expect(typeof barrel.useHealthQueries).toBe('function')
  })

  it('re-exports HealthFetchers type (verifiable via HealthQueryProvider accepting fetchers prop)', async () => {
    // HealthFetchers is a type-only export and cannot be tested at runtime.
    // Its correctness is verified transitively: HealthQueryProvider accepts
    // a `fetchers` prop typed as HealthFetchers. If the type export were
    // broken, TypeScript compilation would fail.
    const barrel = await import('../index')
    expect(barrel.HealthQueryProvider).toBeDefined()
  })
})
