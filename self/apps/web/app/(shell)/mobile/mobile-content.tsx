'use client'

import { MobileOperationsSurface } from '@/components/mobile/mobile-operations-surface'
import { trpc } from '@/lib/trpc'

export interface MobileContentProps {
  projectId: string | null
}

export function MobileContent({ projectId }: MobileContentProps) {
  const operationsSnapshot = trpc.mobile.operationsSnapshot.useQuery(
    {
      projectId: projectId as any,
    },
    {
      enabled: projectId != null,
    },
  )

  if (!projectId) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--nous-space-4xl)',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            maxWidth: '24rem',
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          Select a project from the navigation to open the mobile operating surface.
        </p>
      </div>
    )
  }

  if (operationsSnapshot.isLoading || !operationsSnapshot.data) {
    return (
      <div style={{ padding: 'var(--nous-space-3xl)' }}>
        <p style={{ color: 'var(--nous-text-secondary)' }}>Loading mobile operating surface...</p>
      </div>
    )
  }

  return (
    <MobileOperationsSurface
      snapshot={operationsSnapshot.data}
      maoContext={null}
      linkedRunId={null}
      linkedNodeId={null}
      marketplaceContext={null}
    />
  )
}
