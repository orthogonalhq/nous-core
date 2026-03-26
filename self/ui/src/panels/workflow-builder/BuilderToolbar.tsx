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
  /** SP 2.5 — Save handler (serialization only, persistence in Phase 3). */
  onSave?: () => void
  /** SP 2.5 — Toggle validation panel and trigger re-validation. */
  onValidate?: () => void
  /** SP 2.5 — Whether builder state has unsaved changes. */
  isDirty?: boolean
  /** SP 2.5 — Number of current validation errors. */
  validationErrorCount?: number
  /** SP 2.5 — Whether the validation panel is currently open. */
  isValidationPanelOpen?: boolean
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

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--nous-node-trigger, #e06c75)',
  color: '#fff',
  fontSize: '10px',
  fontWeight: 700,
  borderRadius: '9px',
  minWidth: 18,
  height: 18,
  padding: '0 5px',
  lineHeight: 1,
  marginLeft: '-4px',
}

export function BuilderToolbar({
  mode,
  onModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onSave,
  onValidate,
  isDirty = false,
  validationErrorCount = 0,
  isValidationPanelOpen = false,
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
          aria-label={`${m.label} mode`}
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
        aria-label="Zoom in"
        style={buttonBaseStyle}
        onClick={() => zoomIn()}
      >
        <i className="codicon codicon-zoom-in" style={{ fontSize: 14 }} />
      </button>
      <button
        type="button"
        title="Zoom Out"
        aria-label="Zoom out"
        style={buttonBaseStyle}
        onClick={() => zoomOut()}
      >
        <i className="codicon codicon-zoom-out" style={{ fontSize: 14 }} />
      </button>
      <button
        type="button"
        title="Fit View"
        aria-label="Fit view"
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
        aria-label="Undo"
        style={canUndo ? buttonBaseStyle : disabledButtonStyle}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <i className="codicon codicon-discard" style={{ fontSize: 14 }} />
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        style={canRedo ? buttonBaseStyle : disabledButtonStyle}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <i className="codicon codicon-redo" style={{ fontSize: 14 }} />
      </button>

      {/* ── Save (SP 2.5) ── */}
      <button
        type="button"
        title="Serialize workflow (persistence coming in Phase 3)"
        aria-label="Save workflow"
        data-testid="toolbar-save"
        style={isDirty ? buttonBaseStyle : disabledButtonStyle}
        disabled={!isDirty || !onSave}
        onClick={onSave}
      >
        <i className="codicon codicon-save" style={{ fontSize: 14 }} />
      </button>

      {/* ── Validate (SP 2.5) ── */}
      <button
        type="button"
        title="Toggle Validation Panel"
        aria-label="Toggle validation panel"
        data-testid="toolbar-validate"
        style={isValidationPanelOpen ? activeButtonStyle : buttonBaseStyle}
        disabled={!onValidate}
        onClick={onValidate}
      >
        <i className="codicon codicon-check-all" style={{ fontSize: 14 }} />
      </button>
      {validationErrorCount > 0 && (
        <span
          data-testid="toolbar-validation-badge"
          role="status"
          aria-label={`${validationErrorCount} validation error${validationErrorCount !== 1 ? 's' : ''}`}
          style={badgeStyle}
        >
          {validationErrorCount}
        </span>
      )}

      {/* ── Auto Layout (disabled stub — Phase 4 scope) ── */}
      <button type="button" title="Auto Layout" aria-label="Auto layout" style={disabledButtonStyle} disabled>
        <i className="codicon codicon-layout" style={{ fontSize: 14 }} />
      </button>
    </div>
  )
}
