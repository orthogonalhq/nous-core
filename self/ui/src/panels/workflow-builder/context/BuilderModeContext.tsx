'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { BuilderMode } from '../../../types/workflow-builder'

interface BuilderModeContextValue {
  mode: BuilderMode
  setMode: (mode: BuilderMode) => void
}

const BuilderModeContext = createContext<BuilderModeContextValue | null>(null)

export function BuilderModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeRaw] = useState<BuilderMode>('authoring')

  const setMode = useCallback((newMode: BuilderMode) => {
    setModeRaw(newMode)
  }, [])

  return (
    <BuilderModeContext.Provider value={{ mode, setMode }}>
      {children}
    </BuilderModeContext.Provider>
  )
}

export function useBuilderMode(): BuilderModeContextValue {
  const ctx = useContext(BuilderModeContext)
  if (!ctx) {
    throw new Error('useBuilderMode must be used within a BuilderModeProvider')
  }
  return ctx
}
