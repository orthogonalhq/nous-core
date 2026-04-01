'use client'

import { useCallback } from 'react'
import { trpc } from '@nous/transport'

export interface WorkflowPickerProps {
  projectId: string
  currentDefinitionId: string | null
  onSelectWorkflow: (definitionId: string) => void
  onNewWorkflow: () => void
  onDeleteWorkflow?: (definitionId: string) => void
  containerRef: React.RefObject<HTMLDivElement | null>
}

const pickerContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'var(--nous-space-md)',
  right: 'var(--nous-space-md)',
  zIndex: 10,
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border)',
  borderRadius: '8px',
  padding: 'var(--nous-space-sm)',
  minWidth: 220,
  maxHeight: 300,
  overflow: 'auto',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 'var(--nous-space-sm)',
  fontSize: 'var(--nous-font-size-sm)',
  fontWeight: 600,
  color: 'var(--nous-fg)',
}

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--nous-space-xs) var(--nous-space-sm)',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-fg-muted)',
  border: '1px solid transparent',
}

const activeListItemStyle: React.CSSProperties = {
  ...listItemStyle,
  background: 'var(--nous-bg-active)',
  border: '1px solid var(--nous-border-strong)',
  color: 'var(--nous-fg)',
}

const newButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)',
  background: 'transparent',
  border: '1px solid var(--nous-border)',
  borderRadius: '4px',
  color: 'var(--nous-fg-muted)',
  cursor: 'pointer',
  padding: 'var(--nous-space-xs) var(--nous-space-sm)',
  fontSize: 'var(--nous-font-size-xs)',
}

const badgeStyle: React.CSSProperties = {
  fontSize: '10px',
  background: 'var(--nous-bg-active)',
  borderRadius: '4px',
  padding: '1px 5px',
  color: 'var(--nous-fg-subtle)',
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--nous-fg-subtle)',
  fontSize: 'var(--nous-font-size-xs)',
  padding: 'var(--nous-space-md)',
}

const errorStyle: React.CSSProperties = {
  color: 'var(--nous-node-trigger, #e06c75)',
  fontSize: 'var(--nous-font-size-xs)',
  padding: 'var(--nous-space-sm)',
  textAlign: 'center',
}

const deleteButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--nous-fg-subtle)',
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: '11px',
  lineHeight: 1,
  borderRadius: '3px',
  opacity: 0.6,
}

export function WorkflowPicker({
  projectId,
  currentDefinitionId,
  onSelectWorkflow,
  onNewWorkflow,
  onDeleteWorkflow,
}: WorkflowPickerProps) {
  const { data: definitions, isLoading, error, refetch } = trpc.projects.listWorkflowDefinitions.useQuery(
    { projectId },
  )

  const handleSelect = useCallback(
    (definitionId: string) => {
      if (definitionId !== currentDefinitionId) {
        onSelectWorkflow(definitionId)
      }
    },
    [currentDefinitionId, onSelectWorkflow],
  )

  return (
    <div style={pickerContainerStyle} data-testid="workflow-picker">
      <div style={headerStyle}>
        <span>Workflows</span>
        <button
          type="button"
          style={newButtonStyle}
          onClick={onNewWorkflow}
          data-testid="workflow-picker-new"
        >
          <i className="codicon codicon-add" style={{ fontSize: 12 }} />
          New
        </button>
      </div>

      {isLoading && (
        <div style={emptyStyle} data-testid="workflow-picker-loading">
          Loading...
        </div>
      )}

      {error && (
        <div style={errorStyle} data-testid="workflow-picker-error">
          <div>Failed to load workflows</div>
          <button
            type="button"
            style={{ ...newButtonStyle, marginTop: 'var(--nous-space-xs)' }}
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && definitions?.length === 0 && (
        <div style={emptyStyle} data-testid="workflow-picker-empty">
          No workflows yet
        </div>
      )}

      {!isLoading && !error && definitions && definitions.length > 0 && (
        <div data-testid="workflow-picker-list">
          {definitions.map((def) => (
            <div
              key={def.id}
              role="button"
              tabIndex={0}
              style={def.id === currentDefinitionId ? activeListItemStyle : listItemStyle}
              data-testid={`workflow-picker-item-${def.id}`}
              onClick={() => handleSelect(def.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelect(def.id)
                }
              }}
            >
              <span>{def.name}</span>
              <span style={{ display: 'flex', gap: 'var(--nous-space-xs)', alignItems: 'center' }}>
                <span style={badgeStyle}>v{def.version}</span>
                {def.isDefault && <span style={badgeStyle}>default</span>}
                {onDeleteWorkflow && def.id !== currentDefinitionId && (
                  <button
                    type="button"
                    style={deleteButtonStyle}
                    title="Delete workflow"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (window.confirm(`Delete "${def.name}"?`)) {
                        onDeleteWorkflow(def.id)
                      }
                    }}
                  >
                    <i className="codicon codicon-trash" style={{ fontSize: 11 }} />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
