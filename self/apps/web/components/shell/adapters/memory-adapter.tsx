'use client'

import * as React from 'react'
import type { ContentRouterRenderProps } from '@nous/ui/components'
import { useShellContext } from '@nous/ui/components'
import { ErrorBoundary } from '../error-boundary'
import { RouteSkeleton } from '../route-skeleton'
import { MemoryContent } from '../../../app/(shell)/memory/memory-content'

export function MemoryAdapter({ navigate, goBack: _goBack, canGoBack: _canGoBack }: ContentRouterRenderProps) {
  const { activeProjectId } = useShellContext()
  return (
    <ErrorBoundary onReset={() => navigate('memory')}>
      <React.Suspense fallback={<RouteSkeleton />}>
        <MemoryContent projectId={activeProjectId} />
      </React.Suspense>
    </ErrorBoundary>
  )
}
