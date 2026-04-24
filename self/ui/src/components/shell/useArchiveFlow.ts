'use client'

import { useCallback, useRef, useState } from 'react'
import type { ProjectItem } from './types'

export interface UseArchiveFlowArgs {
  activeProjectId: string | null
  projects: ProjectItem[] // full list including archived
  navigationHistory?: string[] // from navigation class; kept defensive per INV-11
  onArchive: (projectId: string) => Promise<unknown>
  onUnarchive: (projectId: string) => Promise<unknown>
  onCreateDefault: () => Promise<{ id: string }>
  onProjectChange: (id: string) => void
  onNavigateHome: () => void
  onError?: (err: unknown, op: 'archive' | 'unarchive') => void
}

export interface UseArchiveFlowApi {
  archive: (projectId: string) => Promise<void>
  unarchive: (projectId: string) => Promise<void>
  isRunning: boolean
}

/**
 * Derive the most-recently-used remaining active peer when the user archives
 * the currently-active project.
 *
 * V1 posture (SDS Decision E): the `navigation` view-state class's
 * `navigationHistory` is PER-project (its document key includes projectId).
 * It therefore cannot supply cross-project recency without introducing a new
 * persistence surface (forbidden by INV-9 in this sub-phase). V1 falls back
 * to a deterministic lexicographic tie-break on `id`, which matches the
 * "one user, one machine" single-user baseline.
 *
 * INV-11: defensive against `undefined` / empty / malformed `navigationHistory`.
 */
export function deriveMruActivePeer(args: {
  archivedProjectId: string
  allProjects: ProjectItem[]
  navigationHistory?: string[]
}): string | null {
  const peers = args.allProjects.filter(
    (p) => p.archived !== true && p.id !== args.archivedProjectId,
  )
  if (peers.length === 0) return null
  // Deterministic tie-break. Does NOT consult `navigationHistory` (see docs
  // above — the payload is per-project, not cross-project).
  const sorted = [...peers].sort((a, b) => a.id.localeCompare(b.id))
  return sorted[0]!.id
}

/**
 * `useArchiveFlow` — sequenced self-archive state machine.
 *
 * See SDS § Interfaces #2 for the full behavior contract. Key rules:
 *  - archive(): if archiving the active project, pick an MRU peer
 *    (`deriveMruActivePeer`); if none, auto-create "Default" and activate it.
 *  - unarchive(): simple tRPC call, no active-switch side effects.
 *  - `isRunning` true during flight; blocks overlapping invocations.
 *  - On error, `onError(err, op)` fires; `isRunning` clears; NO active-switch
 *    side effects run (INV — Failure Modes rows 1, 3).
 */
export function useArchiveFlow(args: UseArchiveFlowArgs): UseArchiveFlowApi {
  const [isRunning, setIsRunning] = useState(false)
  const runningRef = useRef(false)

  const {
    activeProjectId,
    projects,
    navigationHistory,
    onArchive,
    onUnarchive,
    onCreateDefault,
    onProjectChange,
    onNavigateHome,
    onError,
  } = args

  const archive = useCallback(
    async (projectId: string) => {
      if (runningRef.current) return
      runningRef.current = true
      setIsRunning(true)
      try {
        await onArchive(projectId)

        // Side-effect branching only when archiving the currently-active project.
        if (projectId === activeProjectId) {
          const mruId = deriveMruActivePeer({
            archivedProjectId: projectId,
            allProjects: projects,
            navigationHistory,
          })
          if (mruId) {
            onProjectChange(mruId)
            onNavigateHome()
            // Observability signal (SDS § Observability):
            // eslint-disable-next-line no-console
            console.info('[nous:archive-flow] completed projectId=%s path=peer-switch', projectId)
          } else {
            // No remaining active peers — auto-create Default and activate it.
            const created = await onCreateDefault()
            onProjectChange(created.id)
            onNavigateHome()
            // eslint-disable-next-line no-console
            console.info(
              '[nous:archive-flow] completed projectId=%s path=auto-create-default createdId=%s',
              projectId,
              created.id,
            )
          }
        } else {
          // eslint-disable-next-line no-console
          console.info('[nous:archive-flow] completed projectId=%s path=noop', projectId)
        }
      } catch (err) {
        onError?.(err, 'archive')
      } finally {
        runningRef.current = false
        setIsRunning(false)
      }
    },
    [
      activeProjectId,
      projects,
      navigationHistory,
      onArchive,
      onCreateDefault,
      onProjectChange,
      onNavigateHome,
      onError,
    ],
  )

  const unarchive = useCallback(
    async (projectId: string) => {
      if (runningRef.current) return
      runningRef.current = true
      setIsRunning(true)
      try {
        await onUnarchive(projectId)
      } catch (err) {
        onError?.(err, 'unarchive')
      } finally {
        runningRef.current = false
        setIsRunning(false)
      }
    },
    [onUnarchive, onError],
  )

  return { archive, unarchive, isRunning }
}
