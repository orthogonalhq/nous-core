'use client'

import { useReactFlow } from '@xyflow/react'
import type { BuilderMode } from '../../types/workflow-builder'

export interface BuilderToolbarProps {
  mode: BuilderMode
  onModeChange: (mode: BuilderMode) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

const MODES: { value: BuilderMode; label: string; icon: string }[] = [
  { value: 'authoring', label: 'Author', icon: 'codicon-edit' },
  { value: 'monitoring', label: 'Monitor', icon: 'codicon-pulse' },
  { value: 'inspecting', label: 'Inspect', icon: 'codicon-inspect' },
]

const toolbarContainerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'var(--nous-space-2xl)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-md)',
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border-strong)',
  borderRadius: '8px',
  padding: 'var(--nous-space-xs) var(--nous-space-md)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
}

const buttonBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: '4px',
  color: 'var(--nous-fg-muted)',
  cursor: 'pointer',
  padding: 'var(--nous-space-xs) var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-sm)',
  lineHeight: 1,
  minWidth: 28,
  minHeight: 28,
}

const activeButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  background: 'var(--nous-bg-active)',
  border: '1px solid var(--nous-border-strong)',
  color: 'var(--nous-fg)',
}

const disabledButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  color: 'var(--nous-fg-subtle)',
  cursor: 'not-allowed',
  opacity: 0.5,
}

const separatorStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'var(--nous-border)',
  flexShrink: 0,
}

export function BuilderToolbar({
  mode,
  onModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: BuilderToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <div style={toolbarContainerStyle}>
      {/* ── Mode toggle ── */}
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          title={m.label}
          style={mode === m.value ? activeButtonStyle : buttonBaseStyle}
          onClick={() => onModeChange(m.value)}
        >
          <i className={`codicon ${m.icon}`} style={{ fontSize: 14, marginRight: 'var(--nous-space-xs)' }} />
          <span style={{ fontSize: 'var(--nous-font-size-xs)' }}>{m.label}</span>
        </button>
      ))}

      <div style={separatorStyle} />

      {/* ── Zoom controls ── */}
      <button
        type="button"
        title="Zoom In"
        style={buttonBaseStyle}
        onClick={() => zoomIn()}
      >
        <i className="codicon codicon-zoom-in" style={{ fontSize: 14 }} />
      </button>
      <button
        type="button"
        title="Zoom Out"
        style={buttonBaseStyle}
        onClick={() => zoomOut()}
      >
        <i className="codicon codicon-zoom-out" style={{ fontSize: 14 }} />
      </button>
      <button
        type="button"
        title="Fit View"
        style={buttonBaseStyle}
        onClick={() => fitView()}
      >
        <i className="codicon codicon-screen-full" style={{ fontSize: 14 }} />
      </button>

      <div style={separatorStyle} />

      {/* ── Undo/Redo (wired in SP 2.2) ── */}
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        style={canUndo ? buttonBaseStyle : disabledButtonStyle}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <i className="codicon codicon-discard" style={{ fontSize: 14 }} />
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Shift+Z)"
        style={canRedo ? buttonBaseStyle : disabledButtonStyle}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <i className="codicon codicon-redo" style={{ fontSize: 14 }} />
      </button>

      {/* ── Placeholder actions (non-functional stubs) ── */}
      <button type="button" title="Save" style={disabledButtonStyle} disabled>
        <i className="codicon codicon-save" style={{ fontSize: 14 }} />
      </button>
      <button type="button" title="Validate" style={disabledButtonStyle} disabled>
        <i className="codicon codicon-check-all" style={{ fontSize: 14 }} />
      </button>
      <button type="button" title="Auto Layout" style={disabledButtonStyle} disabled>
        <i className="codicon codicon-layout" style={{ fontSize: 14 }} />
      </button>
    </div>
  )
}
