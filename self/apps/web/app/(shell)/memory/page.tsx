'use client'

import * as React from 'react'
import { useProject } from '@/lib/project-context'
import { MemoryContent } from './memory-content'

export default function MemoryPage() {
  const { projectId } = useProject()
  return <MemoryContent projectId={projectId} />
}
