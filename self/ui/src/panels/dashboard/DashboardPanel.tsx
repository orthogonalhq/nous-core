import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DockviewReact } from 'dockview-react'
import type { IDockviewPanelProps, DockviewApi, DockviewReadyEvent } from 'dockview-react'
import { dashboardWidgets, WIDGET_DEFS } from './widgets'
import type { WidgetDef } from './widgets'

// ─── Widget toggle logic ────────────────────────────────────────────────────

function toggleWidget(api: DockviewApi, def: WidgetDef) {
  const existing = api.getPanel(def.id)
  if (existing) {
    api.removePanel(existing)
  } else {
    api.addPanel({ id: def.id, component: def.component, title: def.title })
  }
}

// ─── Nested API subscription ────────────────────────────────────────────────
// Allows the outer dockview's header actions component to access the nested
// dashboard DockviewApi without tight coupling or React context plumbing.

type ApiListener = (api: DockviewApi | null) => void
const _listeners = new Set<ApiListener>()
let _nestedApi: DockviewApi | null = null

function setNestedApi(api: DockviewApi | null) {
  _nestedApi = api
  _listeners.forEach((fn) => fn(api))
}

/** Subscribe to the nested dashboard DockviewApi. Returns current value immediately. */
export function useDashboardApi(): DockviewApi | null {
  const [api, setApi] = useState<DockviewApi | null>(_nestedApi)
  useEffect(() => {
    setApi(_nestedApi)
    _listeners.add(setApi)
    return () => { _listeners.delete(setApi) }
  }, [])
  return api
}

// ─── Default layout positions ───────────────────────────────────────────────

const WIDGET_POSITIONS: Record<string, { direction: string; referencePanel: string }> = {
  'active-agents': { direction: 'below', referencePanel: 'system-status' },
  'provider-health': { direction: 'right', referencePanel: 'system-status' },
  'token-usage': { direction: 'below', referencePanel: 'provider-health' },
  'recent-events': { direction: 'below', referencePanel: 'token-usage' },
}

function initDashboardLayout(event: DockviewReadyEvent) {
  for (const def of WIDGET_DEFS) {
    event.api.addPanel({
      id: def.id,
      component: def.component,
      title: def.title,
      ...(WIDGET_POSITIONS[def.id] ? { position: WIDGET_POSITIONS[def.id] } : {}),
    })
  }
}

// ─── Widget toggle menu ─────────────────────────────────────────────────────
// Rendered by the outer dockview's rightHeaderActionsComponent when the
// dashboard tab is active. Portal-based dropdown escapes overflow clipping.

export function DashboardWidgetMenu({ api }: { api: DockviewApi }) {
  const [open, setOpen] = useState(false)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () => setOpenIds(new Set(api.panels.map((p) => p.id)))
    sync()
    const d1 = api.onDidAddPanel(sync)
    const d2 = api.onDidRemovePanel(sync)
    return () => { d1.dispose(); d2.dispose() }
  }, [api])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = useCallback((def: WidgetDef) => {
    toggleWidget(api, def)
  }, [api])

  const handleClick = useCallback(() => {
    setOpen((v) => {
      if (!v && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect()
        setMenuPos({ top: rect.bottom + 2, left: rect.right })
      }
      return !v
    })
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <button
        ref={btnRef}
        onClick={handleClick}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--nous-fg-muted)',
          cursor: 'pointer',
          padding: '0 var(--nous-space-md)',
          fontSize: 'var(--nous-icon-size-md)',
          lineHeight: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
        title="Toggle dashboard widgets"
      >
        &#x22EF;
      </button>
      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            transform: 'translateX(-100%)',
            zIndex: 'var(--nous-menu-content-z)' as any,
            minWidth: '180px',
            background: 'var(--nous-menu-content-bg)',
            border: '1px solid var(--nous-menu-content-border)',
            borderRadius: 'var(--nous-menu-content-radius)',
            padding: 'var(--nous-space-xs) 0',
            boxShadow: 'var(--nous-menu-content-shadow)',
          }}
        >
          <div
            style={{
              padding: 'var(--nous-space-xs) var(--nous-space-md) var(--nous-space-2xs)',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-menu-label-fg)',
              userSelect: 'none',
            }}
          >
            Widgets
          </div>
          {WIDGET_DEFS.map((def) => (
            <button
              key={def.id}
              onClick={() => handleToggle(def)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--nous-space-md)',
                width: '100%',
                padding: 'var(--nous-space-xs) var(--nous-space-md)',
                paddingLeft: 'var(--nous-space-3xl)',
                position: 'relative',
                fontSize: 'var(--nous-font-size-sm)',
                color: 'var(--nous-menu-item-fg)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: 'var(--nous-menu-item-radius)',
                margin: '0 var(--nous-space-xs)',
                boxSizing: 'border-box',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--nous-menu-item-hover-bg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 'var(--nous-space-md)',
                  width: 'var(--nous-icon-size-sm)',
                  textAlign: 'center',
                  fontSize: 'var(--nous-font-size-sm)',
                }}
              >
                {openIds.has(def.id) ? '\u2713' : ''}
              </span>
              {def.title}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── Dashboard panel ─────────────────────────────────────────────────────────

export function DashboardPanel(_props: IDockviewPanelProps) {
  const onReady = (event: DockviewReadyEvent) => {
    setNestedApi(event.api)
    initDashboardLayout(event)
  }

  useEffect(() => () => { setNestedApi(null) }, [])

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        padding: 'var(--nous-space-xs)',
        boxSizing: 'border-box',
        background: 'var(--nous-nested-surface)',
      }}
    >
      <DockviewReact
        className="dockview-theme-nested"
        onReady={onReady}
        components={dashboardWidgets}
      />
    </div>
  )
}
