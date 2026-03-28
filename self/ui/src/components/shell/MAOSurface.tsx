'use client'

import { MAOPanel } from '../../panels/MAOPanel'
import type { MaoApi } from '../../panels/MAOPanel'
import type { MAOSurfaceProps } from './types'

export function MAOSurface(props: MAOSurfaceProps) {
  return (
    <MAOPanel
      maoApi={props.maoApi}
      hostingContext="observe-child"
      className={props.className}
    />
  )
}
