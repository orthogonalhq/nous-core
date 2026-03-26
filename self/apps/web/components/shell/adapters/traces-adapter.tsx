'use client'

import * as React from 'react'
import type { ContentRouterRenderProps } from '@nous/ui/components'
import { useShellContext } from '@nous/ui/components'
import { ErrorBoundary } from '../error-boundary'
import { RouteSkeleton } from '../route-skeleton'
import { TracesContent } from '../../../app/(shell)/traces/traces-content'

export function TracesAdapter({ navigate, goBack: _goBack, canGoBack: _canGoBack }: ContentRouterRenderProps) {
  const { activeProjectId } = useShellContext()
  return (
    <ErrorBoundary onReset={() => navigate('traces')}>
      <React.Suspense fallback={<RouteSkeleton />}>
        <TracesContent projectId={activeProjectId} />
      </React.Suspense>
    </ErrorBoundary>
  )
}
