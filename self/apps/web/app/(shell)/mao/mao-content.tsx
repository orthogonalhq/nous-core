'use client'

import * as React from 'react'
import { MaoOperatingSurface } from '@/components/mao/mao-operating-surface'

export interface MaoContentProps {
  projectId: string | null
}

export function MaoContent({ projectId: _projectId }: MaoContentProps) {
  return <MaoOperatingSurface />
}
