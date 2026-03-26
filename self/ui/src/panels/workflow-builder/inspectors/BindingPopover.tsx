'use client'

import React, { useState, useCallback } from 'react'
import type { BindingPopoverProps } from '../../../types/workflow-builder'

// ─── Styles ──────────────────────────────────────────────────────────────────

const triggerButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border)',
  borderRadius: 'var(--nous-radius-sm)' as unknown as string,
  color: 'var(--nous-fg-muted)',
  cursor: 'pointer',
  padding: 4,
  width: 28,
  height: 28,
  fontSize: 14,
  flexShrink: 0,
}

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 10,
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border)',
  borderRadius: 'var(--nous-radius-md)' as unknown as string,
  boxShadow: 'var(--nous-builder-panel-shadow)',
  padding: 'var(--nous-space-sm)' as unknown as string,
  minWidth: 180,
  maxHeight: 200,
  overflow: 'auto',
  marginTop: 4,
}

const optionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)' as unknown as string,
  padding: 'var(--nous-space-xs) var(--nous-space-sm)' as unknown as string,
  cursor: 'pointer',
  borderRadius: 'var(--nous-radius-xs)' as unknown as string,
  fontSize: 'var(--nous-font-size-sm)' as unknown as string,
  color: 'var(--nous-fg)',
  border: 'none',
  background: 'transparent',
  width: '100%',
  textAlign: 'left' as const,
}

const clearButtonStyle: React.CSSProperties = {
  ...optionStyle,
  color: 'var(--nous-error)',
  borderTop: '1px solid var(--nous-border)',
  marginTop: 4,
  paddingTop: 'var(--nous-space-xs)' as unknown as string,
}

const emptyStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  color: 'var(--nous-fg-muted)',
  padding: 'var(--nous-space-xs)' as unknown as string,
}

const kindBadgeStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  color: 'var(--nous-fg-dim)',
  marginLeft: 'auto',
}

// ─── Component ───────────────────────────────────────────────────────────────

function BindingPopoverInner({
  fieldName,
  value,
  options,
  onSelect,
  onClear,
}: BindingPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleSelect = useCallback(
    (bindingValue: string) => {
      onSelect(bindingValue)
      setIsOpen(false)
    },
    [onSelect],
  )

  const handleClear = useCallback(() => {
    onClear()
    setIsOpen(false)
  }, [onClear])

  return (
    <div style={{ position: 'relative' }} data-testid={`binding-popover-${fieldName}`}>
      <button
        type="button"
        style={triggerButtonStyle}
        onClick={toggle}
        aria-label={`Bind ${fieldName}`}
        data-testid={`binding-trigger-${fieldName}`}
      >
        <i className="codicon codicon-link" />
      </button>

      {isOpen && (
        <div style={popoverStyle} data-testid={`binding-dropdown-${fieldName}`}>
          {options.length === 0 ? (
            <span style={emptyStyle}>No bindings available</span>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                style={{
                  ...optionStyle,
                  fontWeight: opt.value === value ? 600 : 400,
                }}
                onClick={() => handleSelect(opt.value)}
                aria-label={`Select binding ${opt.label}`}
                data-testid={`binding-option-${opt.value}`}
              >
                <span>{opt.label}</span>
                <span style={kindBadgeStyle}>{opt.kind}</span>
              </button>
            ))
          )}

          {value && (
            <button
              type="button"
              style={clearButtonStyle}
              onClick={handleClear}
              aria-label={`Clear ${fieldName} binding`}
              data-testid={`binding-clear-${fieldName}`}
            >
              Clear binding
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export const BindingPopover = React.memo(BindingPopoverInner)
