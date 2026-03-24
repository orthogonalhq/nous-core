'use client'

import { MAOPanel } from '../../panels/MAOPanel'
import type { MaoApi } from '../../panels/MAOPanel'
import type { MAOSurfaceProps } from './types'

export function MAOSurface(props: MAOSurfaceProps) {
  const maoApi: MaoApi | undefined =
    props.maoApi ?? (window as any).electronAPI?.mao ?? undefined

  return (
    <MAOPanel
      maoApi={maoApi}
      hostingContext="observe-child"
      className={props.className}
    />
  )
}
