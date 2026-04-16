import * as React from 'react'
import { createPortal } from 'react-dom'

export interface ConfirmDeleteDialogProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  itemName: string
  itemType?: string
  confirmWord?: string
  title?: string
  description?: string
}

export function ConfirmDeleteDialog({
  isOpen,
  onConfirm,
  onCancel,
  itemName,
  itemType,
  confirmWord = 'DELETE',
  title,
  description,
}: ConfirmDeleteDialogProps) {
  const [inputValue, setInputValue] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dialogRef = React.useRef<HTMLDivElement>(null)

  // Reset input when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setInputValue('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // ESC key handler
  React.useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onCancel])

  // Focus trap
  React.useEffect(() => {
    if (!isOpen || !dialogRef.current) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  if (!isOpen) return null

  const matches = inputValue === confirmWord
  const resolvedTitle = title ?? `Delete ${itemName}?`
  const resolvedDescription = description
    ?? `This action cannot be undone.${itemType ? ` This ${itemType} will be permanently deleted.` : ''} Type ${confirmWord} to confirm.`

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-labelledby="confirm-delete-title"
      aria-describedby="confirm-delete-desc"
      data-testid="confirm-delete-dialog"
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--nous-z-modal)' as unknown as number, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Overlay */}
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, background: 'var(--nous-overlay-bg)' }}
      />
      {/* Panel */}
      <div style={{
        position: 'relative',
        background: 'var(--nous-bg)',
        border: '1px solid var(--nous-border-subtle)',
        borderRadius: 'var(--nous-radius-lg)',
        boxShadow: 'var(--nous-shadow-lg)',
        backdropFilter: 'blur(var(--nous-blur-lg))',
        padding: 'var(--nous-space-3xl)',
        maxWidth: '28rem',
        width: '100%',
        animation: 'confirmDeleteFadeIn var(--nous-modal-enter)',
      }}>
        <style>{`
          @keyframes confirmDeleteFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <h2 id="confirm-delete-title" style={{ margin: '0 0 8px', fontSize: 'var(--nous-font-size-lg)', color: 'var(--nous-fg)' }}>
          {resolvedTitle}
        </h2>
        <p id="confirm-delete-desc" style={{ margin: '0 0 16px', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-text-secondary)' }}>
          {resolvedDescription}
        </p>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches) onConfirm()
          }}
          placeholder={confirmWord}
          data-testid="confirm-delete-input"
          style={{
            width: '100%',
            background: 'var(--nous-bg)',
            border: '1px solid var(--nous-border)',
            borderRadius: 'var(--nous-radius-sm)',
            padding: '8px 12px',
            color: 'var(--nous-fg)',
            fontSize: 'var(--nous-font-size-sm)',
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid var(--nous-border)',
              borderRadius: 'var(--nous-radius-sm)',
              color: 'var(--nous-fg)',
              cursor: 'pointer',
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches}
            data-testid="confirm-delete-submit"
            style={{
              padding: '8px 16px',
              background: 'var(--nous-alert-error)',
              border: 'none',
              borderRadius: 'var(--nous-radius-sm)',
              color: 'var(--nous-fg-on-color)',
              cursor: matches ? 'pointer' : 'not-allowed',
              opacity: matches ? 1 : 0.5,
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
