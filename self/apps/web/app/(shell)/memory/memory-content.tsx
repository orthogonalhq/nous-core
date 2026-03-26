'use client'

import * as React from 'react'
import { MemoryInspector } from '@/components/memory/memory-inspector'

export interface MemoryContentProps {
  projectId: string | null
}

export function MemoryContent({ projectId }: MemoryContentProps) {
  if (!projectId) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--nous-space-4xl)',
        }}
      >
        <p style={{ color: 'var(--nous-text-secondary)' }}>
          Select a project from the navigation panel to inspect memory.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 'var(--nous-space-4xl)' }}>
      <MemoryInspector projectId={projectId} />
    </div>
  )
}
