'use client'

import * as React from 'react'
import { MaoContent } from './mao-content'

export default function MaoPage() {
  return (
    <React.Suspense
      fallback={
        <div style={{ padding: 'var(--nous-space-4xl)' }}>
          <p style={{ color: 'var(--nous-text-secondary)' }}>Loading MAO projection...</p>
        </div>
      }
    >
      <MaoContent projectId={null} />
    </React.Suspense>
  )
}
