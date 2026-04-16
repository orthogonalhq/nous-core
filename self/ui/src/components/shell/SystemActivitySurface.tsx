'use client'

import { SystemActivityPanel } from '../../panels/SystemActivityPanel'

export interface SystemActivitySurfaceProps {
  className?: string
}

export function SystemActivitySurface(props: SystemActivitySurfaceProps) {
  return (
    <SystemActivityPanel
      hostingContext="observe-child"
      className={props.className}
    />
  )
}
