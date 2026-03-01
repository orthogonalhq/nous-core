'use client'
import * as Menubar from '@radix-ui/react-menubar'
import type { CSSProperties } from 'react'

// Electron-specific CSS property
type ElectronStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

const api = () => (window as any).electronAPI

// ─── Shared style primitives ────────────────────────────────────────────────

const triggerStyle: ElectronStyle = {
  WebkitAppRegion: 'no-drag',
  display: 'flex',
  alignItems: 'center',
  padding: '0 6px',
  height: '30px',
  fontSize: '12px',
  color: 'var(--nous-fg)',
  background: 'transparent',
  border: 'none',
  cursor: 'default',
  userSelect: 'none',
  outline: 'none',
  borderRadius: '3px',
}

const contentStyle: CSSProperties = {
  minWidth: '200px',
  background: 'var(--nous-menu-bg)',
  border: '1px solid var(--nous-menu-border)',
  borderRadius: '4px',
  padding: '4px 0',
  boxShadow: '0 2px 8px var(--nous-shadow)',
  zIndex: 9999,
}

const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '32px',
  padding: '4px 8px',
  fontSize: '12px',
  color: 'var(--nous-fg)',
  cursor: 'default',
  outline: 'none',
  userSelect: 'none',
  borderRadius: '2px',
  margin: '0 4px',
}

const shortcutStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--nous-fg-muted)',
  marginLeft: 'auto',
  flexShrink: 0,
}

const separatorStyle: CSSProperties = {
  height: '1px',
  background: 'var(--nous-border)',
  margin: '4px 0',
}

const labelStyle: CSSProperties = {
  padding: '4px 8px 2px',
  fontSize: '11px',
  color: 'var(--nous-fg-subtle)',
  userSelect: 'none',
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
      background: var(--nous-btn-hover) !important;
    }
    [data-nous-menu-item]:hover,
    [data-nous-menu-item]:focus,
    [data-nous-menu-item][data-highlighted] {
      background: var(--nous-menu-hover) !important;
      color: var(--nous-fg-on-color) !important;
      outline: none;
    }
    [data-nous-menu-item][data-highlighted] span {
      color: var(--nous-fg) !important;
    }
    [data-nous-menu-item][data-disabled] {
      color: var(--nous-fg-subtle) !important;
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

function ViewMenu() {
  return (
    <Menubar.Menu>
      <Menubar.Trigger style={triggerStyle} data-nous-menu-trigger>View</Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content style={contentStyle} align="start" sideOffset={0}>
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

export function AppMenuBar() {
  // Inject hover CSS once on first render
  injectHoverStyles()

  return (
    <Menubar.Root
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0px',
        // The root is inside the drag region, but individual triggers override to no-drag
        WebkitAppRegion: 'no-drag',
      } as ElectronStyle}
    >
      <FileMenu />
      <ViewMenu />
      <HelpMenu />
    </Menubar.Root>
  )
}
