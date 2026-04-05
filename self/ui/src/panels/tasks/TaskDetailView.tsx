'use client'

import * as React from 'react'
import { useEffect, useState, useCallback } from 'react'
import type { ContentRouterRenderProps } from '../../components/shell/ContentRouter'
import { useShellContext } from '../../components/shell/ShellContext'
import { useTasks } from '../../hooks/useTasks'
import type { TaskExecutionRecord } from '@nous/shared'

export interface TaskDetailViewProps extends ContentRouterRenderProps {}

/**
 * Task detail view — displays task definition details, enable/disable toggle,
 * manual trigger, and recent execution history.
 */
export function TaskDetailView({ navigate, goBack, canGoBack, params }: TaskDetailViewProps) {
  const taskId = params?.taskId as string | undefined
  const { activeProjectId } = useShellContext()
  const tasksApi = useTasks({ projectId: activeProjectId })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [secretRevealed, setSecretRevealed] = useState(false)
  const [triggerPending, setTriggerPending] = useState(false)
  const [togglePending, setTogglePending] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  // Load task and executions on mount / taskId change
  useEffect(() => {
    if (taskId) {
      tasksApi.loadTask(taskId)
      tasksApi.loadExecutions(taskId)
    }
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  const task = tasksApi.activeTask
  const loading = tasksApi.activeTaskLoading
  const error = tasksApi.activeTaskError

  const handleToggle = useCallback(async () => {
    if (!taskId || togglePending) return
    setTogglePending(true)
    setMutationError(null)
    try {
      await tasksApi.toggleTask(taskId)
    } catch (err) {
      setMutationError(String((err as Error)?.message ?? 'Toggle failed'))
    } finally {
      setTogglePending(false)
    }
  }, [taskId, togglePending, tasksApi])

  const handleTrigger = useCallback(async () => {
    if (!taskId || triggerPending) return
    setTriggerPending(true)
    setMutationError(null)
    try {
      await tasksApi.triggerTask(taskId)
    } catch (err) {
      setMutationError(String((err as Error)?.message ?? 'Trigger failed'))
    } finally {
      setTriggerPending(false)
    }
  }, [taskId, triggerPending, tasksApi])

  const handleEdit = useCallback(() => {
    if (taskId) {
      navigate('task-create', { taskId })
    }
  }, [taskId, navigate])

  const handleDelete = useCallback(async () => {
    if (!taskId) return
    setMutationError(null)
    try {
      await tasksApi.deleteTask(taskId)
      goBack()
    } catch (err) {
      setMutationError(String((err as Error)?.message ?? 'Delete failed'))
      setShowDeleteConfirm(false)
    }
  }, [taskId, tasksApi, goBack])

  // --- Error state: not found ---
  if (error) {
    const isNotFound = String(error).includes('NOT_FOUND') || String(error).includes('not found')
    return (
      <div data-testid="task-detail-error" style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={headingStyle}>{isNotFound ? 'Task not found' : 'Error loading task'}</h2>
          <p style={textMutedStyle}>{isNotFound ? 'This task may have been deleted.' : String(error)}</p>
          {canGoBack && (
            <button type="button" onClick={goBack} style={buttonSecondaryStyle}>
              Back
            </button>
          )}
        </div>
      </div>
    )
  }

  // --- Loading state ---
  if (loading || !task) {
    return (
      <div data-testid="task-detail-loading" style={containerStyle}>
        <div style={cardStyle}>
          <p style={textMutedStyle}>Loading task...</p>
        </div>
      </div>
    )
  }

  // --- Main detail view ---
  return (
    <div data-testid="task-detail-view" style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', gap: 'var(--nous-space-sm)' }}>
          <button type="button" data-testid="edit-button" onClick={handleEdit} style={buttonSecondaryStyle}>
            Edit
          </button>
          <button
            type="button"
            data-testid="delete-button"
            onClick={() => setShowDeleteConfirm(true)}
            style={buttonDangerStyle}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Mutation error */}
      {mutationError && (
        <div data-testid="mutation-error" style={errorBannerStyle}>
          {mutationError}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div data-testid="delete-confirm" style={confirmBannerStyle}>
          <span>Are you sure you want to delete this task?</span>
          <div style={{ display: 'flex', gap: 'var(--nous-space-sm)' }}>
            <button type="button" data-testid="confirm-delete" onClick={handleDelete} style={buttonDangerStyle}>
              Confirm Delete
            </button>
            <button
              type="button"
              data-testid="cancel-delete"
              onClick={() => setShowDeleteConfirm(false)}
              style={buttonSecondaryStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Task Name */}
      <h2 data-testid="task-name" style={headingStyle}>{task.name}</h2>

      {/* Description */}
      <p data-testid="task-description" style={task.description ? textStyle : textMutedStyle}>
        {task.description || 'No description'}
      </p>

      {/* Trigger Configuration */}
      <div data-testid="trigger-config" style={sectionStyle}>
        <h3 style={subheadingStyle}>Trigger Configuration</h3>
        <div style={detailGridStyle}>
          <span style={labelStyle}>Type:</span>
          <span data-testid="trigger-type" style={valueStyle}>{task.trigger.type}</span>
          {task.trigger.type === 'heartbeat' && (
            <>
              <span style={labelStyle}>Cron:</span>
              <span style={valueStyle}>{task.trigger.cronExpression}</span>
              <span style={labelStyle}>Timezone:</span>
              <span style={valueStyle}>{task.trigger.timezone}</span>
            </>
          )}
          {task.trigger.type === 'webhook' && (
            <>
              <span style={labelStyle}>Path:</span>
              <span style={valueStyle}>{task.trigger.pathSegment}</span>
              <span style={labelStyle}>Secret:</span>
              <span style={valueStyle}>
                {secretRevealed ? task.trigger.secret : '****...****'}
                <button
                  type="button"
                  onClick={() => setSecretRevealed(!secretRevealed)}
                  style={{ ...buttonSmallStyle, marginLeft: 'var(--nous-space-xs)' }}
                >
                  {secretRevealed ? 'Hide' : 'Reveal'}
                </button>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status & Actions */}
      <div data-testid="task-status" style={sectionStyle}>
        <h3 style={subheadingStyle}>Status</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-md)' }}>
          <span style={{
            ...valueStyle,
            color: task.enabled ? '#22c55e' : '#9ca3af',
            fontWeight: 'var(--nous-font-weight-medium, 500)',
          }}>
            {task.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            data-testid="toggle-button"
            onClick={handleToggle}
            disabled={togglePending}
            style={buttonSecondaryStyle}
          >
            {togglePending ? 'Updating...' : (task.enabled ? 'Disable' : 'Enable')}
          </button>
          {task.enabled && (
            <button
              type="button"
              data-testid="trigger-button"
              onClick={handleTrigger}
              disabled={triggerPending}
              style={buttonPrimaryStyle}
            >
              {triggerPending ? 'Triggering...' : 'Trigger Now'}
            </button>
          )}
        </div>
      </div>

      {/* Orchestrator Instructions */}
      <div data-testid="orchestrator-instructions" style={sectionStyle}>
        <h3 style={subheadingStyle}>Orchestrator Instructions</h3>
        <pre style={codeBlockStyle}>{task.orchestratorInstructions}</pre>
      </div>

      {/* Context */}
      {task.context && Object.keys(task.context).length > 0 && (
        <div data-testid="task-context" style={sectionStyle}>
          <h3 style={subheadingStyle}>Context</h3>
          <pre style={codeBlockStyle}>{JSON.stringify(task.context, null, 2)}</pre>
        </div>
      )}

      {/* Recent Executions */}
      <div data-testid="executions-section" style={sectionStyle}>
        <h3 style={subheadingStyle}>Recent Executions</h3>
        {tasksApi.executionsLoading ? (
          <p style={textMutedStyle}>Loading executions...</p>
        ) : tasksApi.executions.length === 0 ? (
          <p style={textMutedStyle}>No executions yet.</p>
        ) : (
          <table data-testid="executions-table" style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Trigger</th>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {tasksApi.executions.map((exec: TaskExecutionRecord) => (
                <tr key={exec.id} data-testid="execution-row">
                  <td style={tdStyle}>
                    <span style={{
                      color: exec.status === 'completed' ? '#22c55e'
                        : exec.status === 'failed' ? '#ef4444'
                        : '#eab308',
                    }}>
                      {exec.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{exec.triggerType}</td>
                  <td style={tdStyle}>{new Date(exec.triggeredAt).toLocaleString()}</td>
                  <td style={tdStyle}>
                    {exec.durationMs != null ? `${(exec.durationMs / 1000).toFixed(1)}s` : '-'}
                  </td>
                  <td style={tdStyle}>{exec.outcome ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Inline Styles ────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  padding: 'var(--nous-space-lg, 24px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-md, 16px)',
  height: '100%',
  overflowY: 'auto',
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--nous-space-md)',
  padding: 'var(--nous-space-3xl)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 'var(--nous-space-sm)',
}

const headingStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xl, 24px)',
  fontWeight: 'var(--nous-font-weight-semibold, 600)',
  color: 'var(--nous-text-primary, #fff)',
  margin: 0,
}

const subheadingStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-base, 16px)',
  fontWeight: 'var(--nous-font-weight-medium, 500)',
  color: 'var(--nous-text-secondary, #aaa)',
  margin: '0 0 var(--nous-space-sm) 0',
}

const textStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm, 14px)',
  color: 'var(--nous-text-primary, #fff)',
  margin: 0,
}

const textMutedStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm, 14px)',
  color: 'var(--nous-text-tertiary, #666)',
  margin: 0,
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-xs, 4px)',
  padding: 'var(--nous-space-md, 16px)',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'var(--nous-catalog-card-bg, rgba(255,255,255,0.03))',
  border: '1px solid var(--nous-shell-column-border, rgba(255,255,255,0.06))',
}

const detailGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: 'var(--nous-space-xs, 4px) var(--nous-space-md, 16px)',
  alignItems: 'baseline',
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm, 14px)',
  color: 'var(--nous-text-tertiary, #666)',
  fontWeight: 'var(--nous-font-weight-medium, 500)',
}

const valueStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm, 14px)',
  color: 'var(--nous-text-primary, #fff)',
}

const codeBlockStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs, 12px)',
  fontFamily: 'var(--nous-font-mono, monospace)',
  color: 'var(--nous-text-primary, #fff)',
  background: 'var(--nous-bg, #0a0a0a)',
  borderRadius: 'var(--nous-radius-sm, 4px)',
  padding: 'var(--nous-space-sm, 8px)',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowX: 'auto',
}

const buttonSecondaryStyle: React.CSSProperties = {
  border: '1px solid var(--nous-shell-column-border, rgba(255,255,255,0.1))',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'var(--nous-catalog-card-bg, rgba(255,255,255,0.03))',
  color: 'var(--nous-text-secondary, #aaa)',
  padding: 'var(--nous-space-xs, 4px) var(--nous-space-sm, 8px)',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-sm, 14px)',
}

const buttonPrimaryStyle: React.CSSProperties = {
  border: '1px solid #22c55e',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'rgba(34, 197, 94, 0.15)',
  color: '#22c55e',
  padding: 'var(--nous-space-xs, 4px) var(--nous-space-sm, 8px)',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-sm, 14px)',
}

const buttonDangerStyle: React.CSSProperties = {
  border: '1px solid #ef4444',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'rgba(239, 68, 68, 0.15)',
  color: '#ef4444',
  padding: 'var(--nous-space-xs, 4px) var(--nous-space-sm, 8px)',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-sm, 14px)',
}

const buttonSmallStyle: React.CSSProperties = {
  border: '1px solid var(--nous-shell-column-border, rgba(255,255,255,0.1))',
  borderRadius: 'var(--nous-radius-sm, 4px)',
  background: 'transparent',
  color: 'var(--nous-text-tertiary, #666)',
  padding: '2px 6px',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-xs, 12px)',
}

const errorBannerStyle: React.CSSProperties = {
  padding: 'var(--nous-space-sm, 8px) var(--nous-space-md, 16px)',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#ef4444',
  fontSize: 'var(--nous-font-size-sm, 14px)',
}

const confirmBannerStyle: React.CSSProperties = {
  padding: 'var(--nous-space-sm, 8px) var(--nous-space-md, 16px)',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'rgba(239, 68, 68, 0.05)',
  border: '1px solid rgba(239, 68, 68, 0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-md)',
  color: 'var(--nous-text-primary, #fff)',
  fontSize: 'var(--nous-font-size-sm, 14px)',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--nous-font-size-sm, 14px)',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 'var(--nous-space-xs, 4px) var(--nous-space-sm, 8px)',
  color: 'var(--nous-text-tertiary, #666)',
  fontWeight: 'var(--nous-font-weight-medium, 500)',
  borderBottom: '1px solid var(--nous-shell-column-border, rgba(255,255,255,0.06))',
}

const tdStyle: React.CSSProperties = {
  padding: 'var(--nous-space-xs, 4px) var(--nous-space-sm, 8px)',
  color: 'var(--nous-text-primary, #fff)',
  borderBottom: '1px solid var(--nous-shell-column-border, rgba(255,255,255,0.03))',
}
