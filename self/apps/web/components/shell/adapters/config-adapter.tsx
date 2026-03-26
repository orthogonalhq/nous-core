'use client'

import * as React from 'react'
import type { ContentRouterRenderProps } from '@nous/ui/components'
import { useShellContext } from '@nous/ui/components'
import { ErrorBoundary } from '../error-boundary'
import { RouteSkeleton } from '../route-skeleton'
import { ConfigContent } from '../../../app/(shell)/config/config-content'

export function ConfigAdapter({ navigate, goBack: _goBack, canGoBack: _canGoBack }: ContentRouterRenderProps) {
  const { activeProjectId } = useShellContext()
  return (
    <ErrorBoundary onReset={() => navigate('config')}>
      <React.Suspense fallback={<RouteSkeleton />}>
        <ConfigContent projectId={activeProjectId} />
      </React.Suspense>
    </ErrorBoundary>
  )
}
