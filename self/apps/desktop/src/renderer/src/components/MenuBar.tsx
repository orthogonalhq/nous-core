'use client'
import { useState, useEffect } from 'react'
import * as Menubar from '@radix-ui/react-menubar'
import type { CSSProperties } from 'react'
import type { DockviewApi } from 'dockview-react'
import type { ShellMode } from '@nous/ui/components'
import type { PanelDef } from '../App'

// Electron-specific CSS property
type ElectronStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

const api = () => (window as any).electronAPI

// ─── Shared style primitives ────────────────────────────────────────────────

const triggerStyle: ElectronStyle = {
  WebkitAppRegion: 'no-drag',
  display: 'flex',
  alignItems: 'center',
  padding: '0 var(--nous-space-sm)',
  height: 'var(--nous-titlebar-height)',
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-menu-trigger-fg)',
  background: 'transparent',
  border: 'none',
  cursor: 'default',
  userSelect: 'none',
  outline: 'none',
  borderRadius: 'var(--nous-menu-trigger-radius)',
}

const contentStyle: CSSProperties = {
  minWidth: '200px',
  background: 'var(--nous-menu-content-bg)',
  border: '1px solid var(--nous-menu-content-border)',
  borderRadius: 'var(--nous-menu-content-radius)',
  padding: 'var(--nous-space-xs) 0',
  boxShadow: 'var(--nous-menu-content-shadow)',
  zIndex: 'var(--nous-menu-content-z)' as any,
}

const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-4xl)',
  padding: 'var(--nous-space-xs) var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-menu-item-fg)',
  cursor: 'default',
  outline: 'none',
  userSelect: 'none',
  borderRadius: 'var(--nous-menu-item-radius)',
  margin: '0 var(--nous-space-xs)',
}

const shortcutStyle: CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-menu-shortcut-fg)',
  marginLeft: 'auto',
  flexShrink: 0,
}

const separatorStyle: CSSProperties = {
  height: '1px',
  background: 'var(--nous-menu-separator)',
  margin: 'var(--nous-space-xs) 0',
}

const labelStyle: CSSProperties = {
  padding: 'var(--nous-space-xs) var(--nous-space-md) var(--nous-space-2xs)',
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-menu-label-fg)',
  userSelect: 'none',
}

const checkboxItemStyle: CSSProperties = {
  ...itemStyle,
  paddingLeft: 'var(--nous-space-3xl)',
  position: 'relative',
}

const indicatorStyle: CSSProperties = {
  position: 'absolute',
  left: 'var(--nous-space-md)',
  width: 'var(--nous-icon-size-md)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

// Hover state is handled via CSS injected once
const HOVER_STYLE_ID = 'nous-menubar-hover'
function injectHoverStyles() {
  if (document.getElementById(HOVER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = HOVER_STYLE_ID
  style.textContent = `
    [data-nous-menu-trigger]:hover,
    [data-nous-menu-trigger][data-state="open"] {
      background: var(--nous-menu-trigger-hover) !important;
    }
    [data-nous-menu-item]:hover,
    [data-nous-menu-item]:focus,
    [data-nous-menu-item][data-highlighted] {
      background: var(--nous-menu-item-hover-bg) !important;
      color: var(--nous-menu-item-hover-fg) !important;
      outline: none;
    }
    [data-nous-menu-item][data-highlighted] span {
      color: var(--nous-menu-item-fg) !important;
    }
    [data-nous-menu-item][data-disabled] {
      color: var(--nous-menu-item-disabled-fg) !important;
      cursor: not-allowed;
    }
  `
  document.head.appendChild(style)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Item({
  label,
  shortcut,
  onSelect,
  disabled,
}: {
  label: string
  shortcut?: string
  onSelect?: () => void
  disabled?: boolean
}) {
  return (
    <Menubar.Item
      style={itemStyle}
      data-nous-menu-item
      disabled={disabled}
      onSelect={onSelect}
    >
      <span>{label}</span>
      {shortcut && <span style={shortcutStyle}>{shortcut}</span>}
    </Menubar.Item>
  )
}

function Separator() {
  return <Menubar.Separator style={separatorStyle} />
}

// ─── Panel toggle ────────────────────────────────────────────────────────────

function togglePanel(dockviewApi: DockviewApi | null, def: PanelDef) {
  if (!dockviewApi) return
  const existing = dockviewApi.getPanel(def.id)
  if (existing) {
    dockviewApi.removePanel(existing)
  } else {
    dockviewApi.addPanel({
      id: def.id,
      component: def.component,
      title: def.title,
      params: def.params?.() ?? {},
      ...(def.position ? { position: def.position } : {}),
    })
  }
}

function logSimpleModeToggle(target: 'chat' | 'observe') {
  console.log(
    `[nous:shell] ${target} column toggle requested (planned for Phase 1.3)`,
  )
}

// ─── Menu definitions ────────────────────────────────────────────────────────

function FileMenu() {
  return (
    <Menubar.Menu>
      <Menubar.Trigger style={triggerStyle} data-nous-menu-trigger>File</Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content style={contentStyle} align="start" sideOffset={0}>
          <Item label="New Window" shortcut="Ctrl+Shift+N" onSelect={() => api()?.app.newWindow()} />
          <Separator />
          <Item label="Close Window" shortcut="Alt+F4" onSelect={() => api()?.win.close()} />
          <Item label="Exit" onSelect={() => api()?.app.quit()} />
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  )
}

function ViewMenu({
  dockviewApi,
  panelDefs,
  mode,
  onModeToggle,
}: {
  dockviewApi: DockviewApi | null
  panelDefs: PanelDef[]
  mode: ShellMode
  onModeToggle: () => void
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (mode !== 'developer' || !dockviewApi) {
      setOpenIds(new Set())
      return
    }

    const sync = () => setOpenIds(new Set(dockviewApi.panels.map((p) => p.id)))
    sync()
    const d1 = dockviewApi.onDidAddPanel(sync)
    const d2 = dockviewApi.onDidRemovePanel(sync)
    return () => { d1.dispose(); d2.dispose() }
  }, [dockviewApi, mode])

  return (
    <Menubar.Menu>
      <Menubar.Trigger style={triggerStyle} data-nous-menu-trigger>View</Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content style={contentStyle} align="start" sideOffset={0}>
          <Menubar.Label style={labelStyle}>Panels</Menubar.Label>
          {mode === 'simple' ? (
            <>
              <Item
                label="Toggle Chat Panel"
                onSelect={() => logSimpleModeToggle('chat')}
              />
              <Item
                label="Toggle Observe Panel"
                onSelect={() => logSimpleModeToggle('observe')}
              />
            </>
          ) : (
            panelDefs.map((def) => (
              <Menubar.CheckboxItem
                key={def.id}
                checked={openIds.has(def.id)}
                onCheckedChange={() => togglePanel(dockviewApi, def)}
                style={checkboxItemStyle}
                data-nous-menu-item
              >
                <Menubar.ItemIndicator style={indicatorStyle}>✓</Menubar.ItemIndicator>
                {def.title}
              </Menubar.CheckboxItem>
            ))
          )}
          <Separator />
          <Item
            label="Toggle Developer Mode"
            shortcut="Ctrl+Shift+D"
            onSelect={onModeToggle}
          />
          <Item
            label="Command Palette"
            shortcut="Ctrl+K"
            disabled
          />
          <Separator />
          <Item
            label="Developer Tools"
            shortcut="Ctrl+Shift+I"
            onSelect={() => api()?.win.toggleDevTools()}
          />
          <Item
            label="Toggle Full Screen"
            shortcut="F11"
            onSelect={() => api()?.win.toggleFullScreen()}
          />
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  )
}

function HelpMenu() {
  return (
    <Menubar.Menu>
      <Menubar.Trigger style={triggerStyle} data-nous-menu-trigger>Help</Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content style={contentStyle} align="start" sideOffset={0}>
          <Menubar.Label style={labelStyle}>Nous OSS</Menubar.Label>
          <Item label="Documentation" disabled />
          <Item label="Report an Issue" disabled />
          <Separator />
          <Item label="About Nous" disabled />
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  )
}

// ─── Root MenuBar ─────────────────────────────────────────────────────────────

export function AppMenuBar({
  dockviewApi,
  panelDefs,
  mode,
  onModeToggle,
}: {
  dockviewApi: DockviewApi | null
  panelDefs: PanelDef[]
  mode: ShellMode
  onModeToggle: () => void
}) {
  // Inject hover CSS once on first render
  injectHoverStyles()

  return (
    <Menubar.Root
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        // The root is inside the drag region, but individual triggers override to no-drag
        WebkitAppRegion: 'no-drag',
      } as ElectronStyle}
    >
      <FileMenu />
      <ViewMenu
        dockviewApi={dockviewApi}
        panelDefs={panelDefs}
        mode={mode}
        onModeToggle={onModeToggle}
      />
      <HelpMenu />
    </Menubar.Root>
  )
}
