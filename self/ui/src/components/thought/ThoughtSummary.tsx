'use client'

import { useState } from 'react'
import { trpc } from '@nous/transport'
import type { ExecutionTrace } from '@nous/shared'
import { TraceDetail } from './TraceDetail'

export interface ThoughtSummaryCounts {
  totalDecisions: number
  approved: number
  denied: number
  memoryWrites: number
  memoryDenials: number
}

export interface ThoughtSummaryProps {
  traceId: string
  className?: string
}

function projectCounts(trace: ExecutionTrace): ThoughtSummaryCounts {
  const turn = trace.turns[0]
  if (!turn) {
    return { totalDecisions: 0, approved: 0, denied: 0, memoryWrites: 0, memoryDenials: 0 }
  }
  const pfcDecisions = turn.pfcDecisions ?? []
  return {
    totalDecisions: pfcDecisions.length,
    approved: pfcDecisions.filter((d) => d.approved).length,
    denied: pfcDecisions.filter((d) => !d.approved).length,
    memoryWrites: (turn.memoryWrites ?? []).length,
    memoryDenials: (turn.memoryDenials ?? []).length,
  }
}

export function ThoughtSummary({ traceId, className }: ThoughtSummaryProps) {
  const [expanded, setExpanded] = useState(false)

  const { data: trace, isLoading, isError } = trpc.traces.get.useQuery(
    { traceId },
    { enabled: !!traceId },
  )

  if (!traceId) {
    return null
  }

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading thought summary"
        data-testid="thought-summary-loading"
        className={className}
        style={{
          fontFamily: 'var(--nous-font-mono)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-subtle)',
          padding: 'var(--nous-space-xs) 0',
        }}
      >
        ...
      </div>
    )
  }

  if (isError || !trace) {
    return null
  }

  const counts = projectCounts(trace)

  const summaryText = `${counts.totalDecisions} decision${counts.totalDecisions !== 1 ? 's' : ''} \u00b7 ${counts.approved} approved \u00b7 ${counts.denied} denied \u00b7 ${counts.memoryWrites} memory write${counts.memoryWrites !== 1 ? 's' : ''}`

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--nous-space-xs)',
      }}
    >
      <button
        role="status"
        aria-label={summaryText}
        aria-expanded={expanded}
        data-testid="thought-summary"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 'var(--nous-space-xs) 0',
          fontFamily: 'var(--nous-font-mono)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-subtle)',
          textAlign: 'left',
          lineHeight: 1.4,
        }}
      >
        {summaryText}
      </button>
      {expanded && <TraceDetail trace={trace} />}
    </div>
  )
}
