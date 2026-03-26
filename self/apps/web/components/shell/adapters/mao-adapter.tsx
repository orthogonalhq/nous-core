'use client'

import * as React from 'react'
import type { ContentRouterRenderProps } from '@nous/ui/components'
import { useShellContext } from '@nous/ui/components'
import { ErrorBoundary } from '../error-boundary'
import { RouteSkeleton } from '../route-skeleton'
import { MaoContent } from '../../../app/(shell)/mao/mao-content'

export function MaoAdapter({ navigate, goBack: _goBack, canGoBack: _canGoBack }: ContentRouterRenderProps) {
  const { activeProjectId } = useShellContext()
  return (
    <ErrorBoundary onReset={() => navigate('mao')}>
      <React.Suspense fallback={<RouteSkeleton />}>
        <MaoContent projectId={activeProjectId} />
      </React.Suspense>
    </ErrorBoundary>
  )
}
