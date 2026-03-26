'use client'

import * as React from 'react'
import type { ContentRouterRenderProps } from '@nous/ui/components'
import { useShellContext } from '@nous/ui/components'
import { ErrorBoundary } from '../error-boundary'
import { RouteSkeleton } from '../route-skeleton'
import { MobileContent } from '../../../app/(shell)/mobile/mobile-content'

export function MobileAdapter({ navigate, goBack: _goBack, canGoBack: _canGoBack }: ContentRouterRenderProps) {
  const { activeProjectId } = useShellContext()
  return (
    <ErrorBoundary onReset={() => navigate('mobile')}>
      <React.Suspense fallback={<RouteSkeleton />}>
        <MobileContent projectId={activeProjectId} />
      </React.Suspense>
    </ErrorBoundary>
  )
}
