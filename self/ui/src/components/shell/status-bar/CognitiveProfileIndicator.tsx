'use client'

import type { CSSProperties } from 'react'
import { trpc } from '@nous/transport'
import { MODEL_ROLE_LABELS, type ModelRole } from '@nous/shared'
import { useShellContext } from '../ShellContext'

/**
 * WR-162 SP 12 (SUPV-SP12-011) — pure closed-form model-ID formatter per
 * Decision #7 § Display format rule.
 *
 *   - Strips provider prefix when '/' separator present:
 *       'anthropic/claude-3.5-sonnet' → 'claude-3.5-sonnet'
 *   - Capitalizes first letter of each '-' segment:
 *       'claude-3.5-sonnet' → 'Claude-3.5-Sonnet'
 *   - Preserves numeric/version segments verbatim within the segment
 *     (the loop only touches the first character; `'3.5'` and `'4.1'`
 *     pass through unchanged because their first char is a digit).
 *
 * Exported for unit testing per IP UT-SP12-IND-CP-FORMATTER.
 */
export function formatModelId(id: string): string {
  const tail = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id
  return tail
    .split('-')
    .map((seg) => (seg.length > 0 ? seg[0].toUpperCase() + seg.slice(1) : seg))
    .join('-')
}

const ROLE_FALLTHROUGH: ReadonlyArray<ModelRole> = [
  'cortex-chat',
  'cortex-system',
  'orchestrators',
  'workers',
]

/**
 * WR-162 SP 12 (SUPV-SP12-007 + SUPV-SP12-012) — Cognitive Profile indicator.
 *
 * Per Decision #7 Option D.2 client-side read: NEVER consumes
 * `statusBarSnapshot.cognitiveProfile` (which is structurally `null` in
 * V1). Reads `activeProjectId` from `useShellContext()` (existing V1
 * field; Risk 1 closure at SDS authorship); queries `trpc.projects.get`
 * gated on `activeProjectId != null`; derives the main label via the
 * closed fall-through chain `cortex-chat → cortex-system → orchestrators
 * → workers → '—'`. Click → 'cost-monitor' tab.
 */
export function CognitiveProfileIndicator() {
  const {
    activeProjectId,
    setActiveObserveTab,
    observePanelCollapsed,
    setObservePanelCollapsed,
  } = useShellContext()

  const projectQuery = trpc.projects.get.useQuery(
    { id: activeProjectId ?? '' },
    { enabled: activeProjectId != null },
  )

  const handleClick = () => {
    setActiveObserveTab('cost-monitor')
    if (observePanelCollapsed) setObservePanelCollapsed(false)
  }

  // Un-gated case: no project active → render '—' (no model assignments path).
  if (activeProjectId == null) {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-indicator="cognitive-profile"
        data-state="no-project"
        aria-label="Cognitive profile (no project active)"
        style={indicatorButtonStyle}
      >
        — CP
      </button>
    )
  }

  const project = projectQuery.data
  const assignments: Partial<Record<ModelRole, string>> =
    (project?.modelAssignments as Partial<Record<ModelRole, string>> | undefined) ?? {}

  // Closed fall-through.
  let mainRole: ModelRole | null = null
  let mainModel: string | null = null
  for (const role of ROLE_FALLTHROUGH) {
    const assigned = assignments[role]
    if (assigned) {
      mainRole = role
      mainModel = assigned
      break
    }
  }

  if (mainRole === null || mainModel === null) {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-indicator="cognitive-profile"
        data-state="no-assignments"
        aria-label="Cognitive profile (no model assignments)"
        style={indicatorButtonStyle}
      >
        — CP
      </button>
    )
  }

  // Hover tooltip: mini-table of MODEL_ROLE_LABELS[role] + formatModelId(model).
  const presentEntries = ROLE_FALLTHROUGH
    .filter((role) => assignments[role])
    .map((role) => `${MODEL_ROLE_LABELS[role]}: ${formatModelId(assignments[role] as string)}`)
  const tooltip = presentEntries.join('\n')

  return (
    <button
      type="button"
      onClick={handleClick}
      data-indicator="cognitive-profile"
      data-state="present"
      data-main-role={mainRole}
      aria-label={`Cognitive profile: ${MODEL_ROLE_LABELS[mainRole]} = ${formatModelId(mainModel)}`}
      title={tooltip}
      style={indicatorButtonStyle}
    >
      {formatModelId(mainModel)}
    </button>
  )
}

const indicatorButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  padding: '0 var(--nous-space-xs)',
}
