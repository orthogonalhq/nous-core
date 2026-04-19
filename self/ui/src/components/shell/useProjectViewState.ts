'use client'

/**
 * useProjectViewState — generic project-keyed view-state hook + four wrappers.
 *
 * Implements the hook surface specified in
 * `.architecture/.decisions/2026-04-18-project-model-and-settings/view-state-schema-v1.md`
 * §6 (binding) and `.worklog/sprints/feat/project-model-and-settings/phase-1/phase-1.2/sds.mdx`
 * §Data Model.
 *
 * Behaviour:
 *   - First-paint: synchronous read from a localStorage mirror keyed on the
 *     active `projectId` and `class`.
 *   - Post-paint reconcile: fires `trpc.viewState.get`; merges by timestamp
 *     (server-newer / tie / local-newer); ties go silently to server (Decision §4).
 *   - Writes: synchronous mirror write (best-effort, try/catch) +
 *     fire-and-forget `trpc.viewState.set`. No `await` in the render path.
 *   - Project switch: `ShellContext.activeProjectId` change triggers a fresh
 *     first-paint cycle for the new project; in-flight `get` for the prior
 *     project is aborted.
 *   - Defensive posture: when `activeProjectId === null` (no active project),
 *     hooks short-circuit — `state` stays `null`, `setState` is a no-op,
 *     `hydrated` is `true` (nothing to reconcile).
 *
 * Atomicity note (Manifest §Decomposition Constraints #11): `useLayoutState`
 * also runs the one-shot migration of the legacy `nous-asset-sidebar-collapsed`
 * key into `layout.sidebarCollapsed`. The legacy `useSidebarCollapsed` hook is
 * deleted in the same landing unit as both call-site migrations
 * (`self/apps/desktop/src/renderer/src/App.tsx` and
 * `self/apps/web/app/(shell)/layout.tsx`).
 */
import * as React from 'react'
import { trpc } from '@nous/transport'
import {
  type PayloadFor,
  type ViewStateClass,
  type LayoutPayload,
  type NavigationPayload,
  type FocusPayload,
  type ContentPayload,
} from '@nous/shared'
import { ShellContext } from './ShellContext'

/**
 * Read `activeProjectId` from ShellContext without requiring a ShellProvider.
 *
 * The call-site for `useLayoutState` in `self/apps/web/app/(shell)/layout.tsx`
 * is above its own ShellProvider JSX node — the provider is rendered later in
 * the same component. During Next.js SSR / prerender, the hook must not
 * throw when no provider is in scope.
 *
 * Short-circuit: when no provider is mounted OR `activeProjectId` is null,
 * the view-state hook treats it as "no project" and returns the defensive
 * no-op posture (state=null, hydrated=true, setState no-op).
 */
function useOptionalActiveProjectId(): string | null {
  const ctx = React.useContext(ShellContext)
  return ctx?.activeProjectId ?? null
}

const MIRROR_KEY_PREFIX = 'nous:view-state'
const LEGACY_SIDEBAR_KEY = 'nous-asset-sidebar-collapsed'
const SERVER_RETRY_DELAY_MS = 2000

interface MirrorEntry {
  payload: unknown
  updatedAt: string
}

function mirrorKey(projectId: string, className: ViewStateClass): string {
  return `${MIRROR_KEY_PREFIX}:${projectId}:${className}`
}

function readMirror(
  projectId: string | null,
  className: ViewStateClass,
): MirrorEntry | null {
  if (projectId === null) return null
  try {
    const raw = localStorage.getItem(mirrorKey(projectId, className))
    if (raw === null) return null
    const parsed = JSON.parse(raw) as MirrorEntry
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeMirror(
  projectId: string,
  className: ViewStateClass,
  entry: MirrorEntry,
  loggedRef: React.MutableRefObject<boolean>,
): void {
  try {
    localStorage.setItem(mirrorKey(projectId, className), JSON.stringify(entry))
  } catch {
    if (!loggedRef.current) {
      console.info('[view-state] mirror unavailable')
      loggedRef.current = true
    }
  }
}

/**
 * Generic project-keyed view-state hook.
 *
 * @param className - The view-state class to read/write. Parameter is named
 * `className` internally because `class` is a JS reserved word; the public
 * tRPC schema field is `class` (handled by Zod / tRPC unchanged).
 */
export function useProjectViewState<C extends ViewStateClass>(
  className: C,
): {
  state: PayloadFor<C> | null
  setState: (next: PayloadFor<C>) => void
  hydrated: boolean
} {
  const activeProjectId = useOptionalActiveProjectId()
  const utils = trpc.useUtils()
  const setMutation = trpc.viewState.set.useMutation()

  // First-paint: synchronous read from mirror keyed on the active project.
  const initialMirror = React.useMemo(
    () => readMirror(activeProjectId, className),
    // We deliberately re-evaluate on project switch via the effect below; the
    // useState initializer only runs on first mount per useState semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [state, setStateInternal] = React.useState<PayloadFor<C> | null>(
    () => (initialMirror?.payload as PayloadFor<C>) ?? null,
  )
  const [hydrated, setHydrated] = React.useState<boolean>(false)
  const localUpdatedAtRef = React.useRef<string | null>(
    initialMirror?.updatedAt ?? null,
  )
  const abortControllerRef = React.useRef<AbortController | null>(null)
  const mirrorLogRef = React.useRef<boolean>(false)
  const setLogRef = React.useRef<{ lastAt: number }>({ lastAt: 0 })
  const activeProjectIdRef = React.useRef<string | null>(activeProjectId)
  activeProjectIdRef.current = activeProjectId

  // Defensive posture: when no active project, short-circuit. State stays
  // null; hydrated flips true (nothing to reconcile).
  const hasProject = activeProjectId !== null

  React.useEffect(() => {
    // Cancel any prior in-flight reconcile.
    abortControllerRef.current?.abort()

    if (!hasProject) {
      setStateInternal(null)
      localUpdatedAtRef.current = null
      setHydrated(true)
      return
    }

    // Re-read mirror for the current project (handles project-switch).
    const currentMirror = readMirror(activeProjectId, className)
    setStateInternal((currentMirror?.payload as PayloadFor<C>) ?? null)
    localUpdatedAtRef.current = currentMirror?.updatedAt ?? null
    setHydrated(false)

    const controller = new AbortController()
    abortControllerRef.current = controller
    let retried = false

    const projectIdSnapshot = activeProjectId

    const performGet = (): Promise<void> =>
      utils.viewState.get
        .fetch({ projectId: projectIdSnapshot, class: className })
        .then((server) => {
          // Superseded / stale-closure guard: discard if project switched
          // mid-flight or if a newer reconcile aborted us. React-query's
          // fetch() does not accept a signal option, so we gate on the
          // AbortController snapshot + the activeProjectId ref.
          if (
            controller.signal.aborted ||
            activeProjectIdRef.current !== projectIdSnapshot
          ) {
            return
          }

          const localUpdatedAt = localUpdatedAtRef.current
          const localPayload = (currentMirror?.payload ?? null) as
            | PayloadFor<C>
            | null

          if (server === null) {
            // Server has no document. If local is non-null, push local (fire-and-forget).
            if (localPayload !== null && localUpdatedAt !== null) {
              fireServerSet(
                projectIdSnapshot,
                className,
                localPayload,
                localUpdatedAt,
              )
            }
          } else if (
            localUpdatedAt === null ||
            server.updatedAt > localUpdatedAt
          ) {
            // Server-newer (or no local anchor): adopt server payload, refresh mirror.
            const serverPayload = server.payload as PayloadFor<C>
            setStateInternal(serverPayload)
            localUpdatedAtRef.current = server.updatedAt
            writeMirror(
              projectIdSnapshot,
              className,
              { payload: serverPayload, updatedAt: server.updatedAt },
              mirrorLogRef,
            )
          } else if (server.updatedAt === localUpdatedAt) {
            // Tie: server wins silently (Decision §4). Re-sync mirror to be safe.
            const serverPayload = server.payload as PayloadFor<C>
            setStateInternal(serverPayload)
            writeMirror(
              projectIdSnapshot,
              className,
              { payload: serverPayload, updatedAt: server.updatedAt },
              mirrorLogRef,
            )
          } else {
            // Local-newer: push local upstream (fire-and-forget).
            if (localPayload !== null && localUpdatedAt !== null) {
              fireServerSet(
                projectIdSnapshot,
                className,
                localPayload,
                localUpdatedAt,
              )
            }
          }

          setHydrated(true)
        })
        .catch((err) => {
          if (controller.signal.aborted) return
          if (
            (err as { name?: string })?.name === 'AbortError' ||
            (err as { code?: string })?.code === 'ABORT_ERR'
          ) {
            return
          }

          console.info(
            `[view-state] server get failed class=${className} projectId=${projectIdSnapshot}`,
          )
          setHydrated(true)

          if (!retried) {
            retried = true
            setTimeout(() => {
              if (
                controller.signal.aborted ||
                activeProjectIdRef.current !== projectIdSnapshot
              ) {
                return
              }
              void performGet()
            }, SERVER_RETRY_DELAY_MS)
          }
        })

    void performGet()

    function fireServerSet(
      pid: string,
      cls: ViewStateClass,
      payload: PayloadFor<C>,
      updatedAt: string,
    ): void {
      // discriminated-union expected by mutation; cast to satisfy TS narrowing.
      setMutation
        .mutateAsync({
          class: cls,
          projectId: pid,
          payload: payload as never,
          updatedAt,
        } as never)
        .then((result) => {
          if (result.updatedAt !== updatedAt) {
            localUpdatedAtRef.current = result.updatedAt
          }
        })
        .catch(() => {
          const now = Date.now()
          if (now - setLogRef.current.lastAt > 5000) {
            setLogRef.current.lastAt = now
            console.info(
              `[view-state] server set failed class=${cls} projectId=${pid}`,
            )
          }
        })
    }

    return () => {
      controller.abort()
    }
    // utils + setMutation are stable across renders; we only want to re-run on
    // project / class change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, className, hasProject])

  // Cleanup any in-flight on unmount.
  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const setState = React.useCallback(
    (next: PayloadFor<C>) => {
      if (!hasProject || activeProjectId === null) return
      const newUpdatedAt = new Date().toISOString()
      writeMirror(
        activeProjectId,
        className,
        { payload: next, updatedAt: newUpdatedAt },
        mirrorLogRef,
      )
      setStateInternal(next)
      localUpdatedAtRef.current = newUpdatedAt

      setMutation
        .mutateAsync({
          class: className,
          projectId: activeProjectId,
          payload: next as never,
          updatedAt: newUpdatedAt,
        } as never)
        .then((result) => {
          if (result.updatedAt !== newUpdatedAt) {
            localUpdatedAtRef.current = result.updatedAt
          }
        })
        .catch(() => {
          const now = Date.now()
          if (now - setLogRef.current.lastAt > 5000) {
            setLogRef.current.lastAt = now
            console.info(
              `[view-state] server set failed class=${className} projectId=${activeProjectId}`,
            )
          }
        })
    },
    [activeProjectId, className, hasProject, setMutation],
  )

  return { state, setState, hydrated }
}

// ─── Wrappers ────────────────────────────────────────────────────────────────

/**
 * Layout-class wrapper. Also runs the one-shot migration of the legacy
 * `nous-asset-sidebar-collapsed` key into `layout.sidebarCollapsed`.
 *
 * Migration runs at most once per (mount × activeProjectId) per the
 * `migrationGuardRef` guard. Idempotent: re-mounts with the legacy key absent
 * are a no-op (SDS Invariant #8 / §Failure Modes rows 9–10).
 */
export function useLayoutState(): {
  state: LayoutPayload | null
  setState: (next: LayoutPayload) => void
  hydrated: boolean
} {
  const result = useProjectViewState('layout')
  const migrationGuardRef = React.useRef<boolean>(false)
  const activeProjectId = useOptionalActiveProjectId()

  React.useEffect(() => {
    if (!result.hydrated) return
    if (migrationGuardRef.current) return
    if (activeProjectId === null) return

    let legacy: string | null
    try {
      legacy = localStorage.getItem(LEGACY_SIDEBAR_KEY)
    } catch {
      // Mirror unavailable; nothing to migrate. Mark guard so we don't
      // re-attempt within this mount.
      migrationGuardRef.current = true
      return
    }

    if (legacy === null) {
      migrationGuardRef.current = true
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(legacy)
    } catch {
      // Unparseable legacy value — drop it without writing.
      try {
        localStorage.removeItem(LEGACY_SIDEBAR_KEY)
      } catch {
        /* mirror unavailable; harmless */
      }
      migrationGuardRef.current = true
      console.info(
        '[view-state] migration discarded unparseable legacy value',
      )
      return
    }

    const sidebarCollapsed = Boolean(parsed)
    const merged: LayoutPayload = {
      ...(result.state ?? {}),
      sidebarCollapsed,
    }
    result.setState(merged)
    try {
      localStorage.removeItem(LEGACY_SIDEBAR_KEY)
    } catch {
      /* mirror unavailable; harmless */
    }
    migrationGuardRef.current = true
    console.info('[view-state] migration transferred')
    // We intentionally depend on `result.hydrated` — when hydration completes,
    // we evaluate migration once. Re-runs after `state`/`activeProjectId`
    // change reset the effect (a project switch resets the guard via
    // re-mount-style behaviour through the parent hook, but within the same
    // mount we deliberately keep the guard sticky). Note: changing
    // activeProjectId is handled via the dependency below so the guard tracks
    // with the active project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.hydrated, activeProjectId])

  return result
}

export function useNavigationState(): {
  state: NavigationPayload | null
  setState: (next: NavigationPayload) => void
  hydrated: boolean
} {
  return useProjectViewState('navigation')
}

export function useFocusState(): {
  state: FocusPayload | null
  setState: (next: FocusPayload) => void
  hydrated: boolean
} {
  return useProjectViewState('focus')
}

/**
 * Content-class wrapper with a sub-key narrowing accessor.
 *
 * Each content surface owns its own sub-shape (Settings owns its form-draft
 * shape in 1.4, etc.). V1 does NOT centrally register `contentKey` schemas —
 * the sub-payload type is `unknown` and each call site narrows locally.
 */
export function useContentState(contentKey: string): {
  state: unknown
  setState: (next: unknown) => void
  hydrated: boolean
} {
  const parent = useProjectViewState('content')
  const state = parent.state?.[contentKey] ?? null
  const setState = React.useCallback(
    (next: unknown) => {
      parent.setState({
        ...(parent.state ?? {}),
        [contentKey]: next,
      })
    },
    [parent, contentKey],
  )
  return { state, setState, hydrated: parent.hydrated }
}
