'use client'

import * as React from 'react'
import { useEffect, useState, useCallback } from 'react'
import type { ContentRouterRenderProps } from '../../components/shell/ContentRouter'
import { useShellContext } from '../../components/shell/ShellContext'
import { useTasks } from '../../hooks/useTasks'
import type { TaskCreateInput, TaskTriggerConfig } from '@nous/shared'

export interface TaskCreateFormProps extends ContentRouterRenderProps {}

// ─── Schedule Presets ────────────────────────────────────────────────────────

export interface SchedulePreset {
  label: string
  cron: string
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { label: 'Every 30 minutes', cron: '*/30 * * * *' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Every 12 hours', cron: '0 */12 * * *' },
  { label: 'Every day', cron: '0 0 * * *' },
  { label: 'Every week', cron: '0 0 * * 0' },
]

/** Find the preset index matching a cron expression, or return 'custom'. */
function resolvePreset(cronExpression: string): number | 'custom' {
  if (!cronExpression) return 0
  const idx = SCHEDULE_PRESETS.findIndex((p) => p.cron === cronExpression)
  return idx >= 0 ? idx : 'custom'
}

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormState {
  name: string
  description: string
  triggerType: 'manual' | 'heartbeat' | 'webhook'
  cronExpression: string
  timezone: string
  pathSegment: string
  secret: string
  orchestratorInstructions: string
  context: string
}

interface FormErrors {
  name?: string
  cronExpression?: string
  pathSegment?: string
  orchestratorInstructions?: string
  context?: string
  form?: string
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  triggerType: 'manual',
  cronExpression: '',
  timezone: 'UTC',
  pathSegment: '',
  secret: '',
  orchestratorInstructions: '',
  context: '',
}

function generateHexSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function isUrlSafe(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskCreateForm({ navigate, goBack, params }: TaskCreateFormProps) {
  const taskId = params?.taskId as string | undefined
  const isEditMode = !!taskId
  const { activeProjectId } = useShellContext()
  const tasksApi = useTasks({ projectId: activeProjectId })

  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [populated, setPopulated] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(0)

  // Load task data for edit mode
  useEffect(() => {
    if (isEditMode && taskId) {
      tasksApi.loadTask(taskId)
    }
  }, [taskId, isEditMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Populate form when task data arrives in edit mode
  useEffect(() => {
    if (isEditMode && tasksApi.activeTask && !populated) {
      const task = tasksApi.activeTask
      const cronExpr = task.trigger.type === 'heartbeat' ? task.trigger.cronExpression : ''
      setForm({
        name: task.name,
        description: task.description,
        triggerType: task.trigger.type,
        cronExpression: cronExpr,
        timezone: task.trigger.type === 'heartbeat' ? task.trigger.timezone : 'UTC',
        pathSegment: task.trigger.type === 'webhook' ? task.trigger.pathSegment : '',
        secret: task.trigger.type === 'webhook' ? task.trigger.secret : '',
        orchestratorInstructions: task.orchestratorInstructions,
        context: task.context ? JSON.stringify(task.context, null, 2) : '',
      })
      setSelectedPreset(resolvePreset(cronExpr))
      setPopulated(true)
    }
  }, [isEditMode, tasksApi.activeTask, populated])

  // Auto-generate webhook secret when switching to webhook and secret is empty
  useEffect(() => {
    if (form.triggerType === 'webhook' && !form.secret) {
      setForm((prev) => ({ ...prev, secret: generateHexSecret() }))
    }
  }, [form.triggerType]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined, form: undefined }))
  }, [])

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {}
    if (!form.name.trim()) {
      errs.name = 'Name is required'
    } else if (form.name.length > 100) {
      errs.name = 'Name must be 100 characters or less'
    }
    if (!form.orchestratorInstructions.trim()) {
      errs.orchestratorInstructions = 'Orchestrator instructions are required'
    }
    if (form.triggerType === 'heartbeat' && !form.cronExpression.trim()) {
      errs.cronExpression = 'Cron expression is required for heartbeat triggers'
    }
    if (form.triggerType === 'webhook') {
      if (!form.pathSegment.trim()) {
        errs.pathSegment = 'Path segment is required for webhook triggers'
      } else if (!isUrlSafe(form.pathSegment)) {
        errs.pathSegment = 'Path segment must be URL-safe (alphanumeric, hyphens, underscores)'
      }
    }
    if (form.context.trim()) {
      try {
        JSON.parse(form.context)
      } catch {
        errs.context = 'Context must be valid JSON'
      }
    }
    return errs
  }, [form])

  const buildTriggerConfig = useCallback((): TaskTriggerConfig => {
    switch (form.triggerType) {
      case 'heartbeat':
        return {
          type: 'heartbeat',
          cronExpression: form.cronExpression,
          timezone: form.timezone || 'UTC',
        }
      case 'webhook':
        return {
          type: 'webhook',
          pathSegment: form.pathSegment,
          secret: form.secret,
        }
      default:
        return { type: 'manual' }
    }
  }, [form])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    console.info('[nous:tasks] Form submit triggered', { name: form.name, triggerType: form.triggerType })
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      console.warn('[nous:tasks] Validation errors:', validationErrors)
      setErrors(validationErrors)
      return
    }

    setSubmitting(true)
    setErrors({})

    const taskInput: TaskCreateInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      trigger: buildTriggerConfig(),
      orchestratorInstructions: form.orchestratorInstructions.trim(),
      context: form.context.trim() ? JSON.parse(form.context) : undefined,
      enabled: false,
    }

    try {
      console.info('[nous:tasks] Submitting task:', JSON.stringify(taskInput))
      if (isEditMode && taskId) {
        await tasksApi.updateTask(taskId, taskInput)
        navigate(`task-detail::${taskId}`)
      } else {
        const created = await tasksApi.createTask(taskInput)
        console.info('[nous:tasks] Task created:', created.id)
        navigate(`task-detail::${created.id}`)
      }
    } catch (err) {
      console.error('[nous:tasks] Submit error:', err)
      const msg = String((err as Error)?.message ?? 'Operation failed')
      if (msg.includes('task_name_conflict')) {
        setErrors({ name: 'A task with this name already exists' })
      } else {
        setErrors({ form: msg })
      }
    } finally {
      setSubmitting(false)
    }
  }, [form, validate, buildTriggerConfig, isEditMode, taskId, tasksApi, navigate])

  const handleCancel = useCallback(() => {
    goBack()
  }, [goBack])

  // Loading state for edit mode
  if (isEditMode && tasksApi.activeTaskLoading && !populated) {
    return (
      <div data-testid="task-form-loading" style={containerStyle}>
        <p style={textMutedStyle}>Loading task...</p>
      </div>
    )
  }

  return (
    <div data-testid="task-create-form" style={containerStyle}>
      <h2 style={headingStyle}>{isEditMode ? 'Edit Task' : 'Create Task'}</h2>

      <form onSubmit={handleSubmit} style={formStyle}>
        {/* Form-level error */}
        {errors.form && (
          <div data-testid="form-error" style={errorBannerStyle}>
            {errors.form}
          </div>
        )}

        {/* Name */}
        <div style={fieldGroupStyle}>
          <label htmlFor="task-name" style={labelStyle}>Name *</label>
          <input
            id="task-name"
            data-testid="name-input"
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Task name"
            maxLength={100}
            style={inputStyle}
          />
          {errors.name && <span data-testid="name-error" style={fieldErrorStyle}>{errors.name}</span>}
        </div>

        {/* Description */}
        <div style={fieldGroupStyle}>
          <label htmlFor="task-description" style={labelStyle}>Description</label>
          <input
            id="task-description"
            data-testid="description-input"
            type="text"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Optional description"
            style={inputStyle}
          />
        </div>

        {/* Trigger Type */}
        <div style={fieldGroupStyle}>
          <label htmlFor="trigger-type" style={labelStyle}>Trigger Type *</label>
          <select
            id="trigger-type"
            data-testid="trigger-type-select"
            value={form.triggerType}
            onChange={(e) => {
              const newType = e.target.value as FormState['triggerType']
              updateField('triggerType', newType)
              if (newType === 'heartbeat' && !form.cronExpression) {
                setSelectedPreset(0)
                updateField('cronExpression', SCHEDULE_PRESETS[0].cron)
              }
            }}
            style={selectStyle}
          >
            <option value="manual">Manual</option>
            <option value="heartbeat">Heartbeat (Cron)</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>

        {/* Heartbeat fields */}
        {form.triggerType === 'heartbeat' && (
          <>
            <div style={fieldGroupStyle}>
              <label htmlFor="schedule-preset" style={labelStyle}>Schedule Interval *</label>
              <select
                id="schedule-preset"
                data-testid="schedule-preset-select"
                value={selectedPreset === 'custom' ? 'custom' : String(selectedPreset)}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'custom') {
                    setSelectedPreset('custom')
                    // Keep current cronExpression so user can edit it
                  } else {
                    const idx = Number(val)
                    setSelectedPreset(idx)
                    updateField('cronExpression', SCHEDULE_PRESETS[idx].cron)
                  }
                }}
                style={selectStyle}
              >
                {SCHEDULE_PRESETS.map((preset, idx) => (
                  <option key={preset.cron} value={String(idx)}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>
            {selectedPreset === 'custom' && (
              <div style={fieldGroupStyle}>
                <label htmlFor="cron-expression" style={labelStyle}>Cron Expression *</label>
                <input
                  id="cron-expression"
                  data-testid="cron-input"
                  type="text"
                  value={form.cronExpression}
                  onChange={(e) => updateField('cronExpression', e.target.value)}
                  placeholder="e.g. 0 */6 * * *"
                  style={inputStyle}
                />
                {errors.cronExpression && (
                  <span data-testid="cron-error" style={fieldErrorStyle}>{errors.cronExpression}</span>
                )}
              </div>
            )}
            <div style={fieldGroupStyle}>
              <label htmlFor="timezone" style={labelStyle}>Timezone</label>
              <input
                id="timezone"
                data-testid="timezone-input"
                type="text"
                value={form.timezone}
                onChange={(e) => updateField('timezone', e.target.value)}
                placeholder="UTC"
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* Webhook fields */}
        {form.triggerType === 'webhook' && (
          <>
            <div style={fieldGroupStyle}>
              <label htmlFor="path-segment" style={labelStyle}>Path Segment *</label>
              <input
                id="path-segment"
                data-testid="path-segment-input"
                type="text"
                value={form.pathSegment}
                onChange={(e) => updateField('pathSegment', e.target.value)}
                placeholder="e.g. my-webhook"
                style={inputStyle}
              />
              {errors.pathSegment && (
                <span data-testid="path-segment-error" style={fieldErrorStyle}>{errors.pathSegment}</span>
              )}
            </div>
            <div style={fieldGroupStyle}>
              <label htmlFor="webhook-secret" style={labelStyle}>Secret</label>
              <input
                id="webhook-secret"
                data-testid="secret-input"
                type="text"
                value={form.secret}
                onChange={(e) => updateField('secret', e.target.value)}
                placeholder="Auto-generated"
                style={{ ...inputStyle, fontFamily: 'var(--nous-font-mono, monospace)', fontSize: 'var(--nous-font-size-xs, 12px)' }}
              />
            </div>
          </>
        )}

        {/* Orchestrator Instructions */}
        <div style={fieldGroupStyle}>
          <label htmlFor="orchestrator-instructions" style={labelStyle}>Orchestrator Instructions *</label>
          <textarea
            id="orchestrator-instructions"
            data-testid="instructions-input"
            value={form.orchestratorInstructions}
            onChange={(e) => updateField('orchestratorInstructions', e.target.value)}
            placeholder="Instructions for the orchestrator agent..."
            rows={6}
            style={textareaStyle}
          />
          {errors.orchestratorInstructions && (
            <span data-testid="instructions-error" style={fieldErrorStyle}>{errors.orchestratorInstructions}</span>
          )}
        </div>

        {/* Context */}
        <div style={fieldGroupStyle}>
          <label htmlFor="context" style={labelStyle}>Context (JSON, optional)</label>
          <textarea
            id="context"
            data-testid="context-input"
            value={form.context}
            onChange={(e) => updateField('context', e.target.value)}
            placeholder='{ "key": "value" }'
            rows={4}
            style={{ ...textareaStyle, fontFamily: 'var(--nous-font-mono, monospace)', fontSize: 'var(--nous-font-size-xs, 12px)' }}
          />
          {errors.context && (
            <span data-testid="context-error" style={fieldErrorStyle}>{errors.context}</span>
          )}
        </div>

        {/* Actions */}
        <div style={actionsStyle}>
          <button
            type="submit"
            data-testid="submit-button"
            disabled={submitting}
            style={buttonPrimaryStyle}
          >
            {submitting ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Task')}
          </button>
          <button
            type="button"
            data-testid="cancel-button"
            onClick={handleCancel}
            style={buttonSecondaryStyle}
          >
            Cancel
          </button>
        </div>
      </form>
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

const headingStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xl, 24px)',
  fontWeight: 'var(--nous-font-weight-semibold, 600)',
  color: 'var(--nous-text-primary, #fff)',
  margin: 0,
}

const textMutedStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm, 14px)',
  color: 'var(--nous-text-tertiary, #666)',
  margin: 0,
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-md, 16px)',
  maxWidth: '640px',
}

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-xs, 4px)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm, 14px)',
  fontWeight: 'var(--nous-font-weight-medium, 500)',
  color: 'var(--nous-text-secondary, #aaa)',
}

const inputStyle: React.CSSProperties = {
  padding: 'var(--nous-space-sm, 8px)',
  borderRadius: 'var(--nous-radius-md, 8px)',
  border: '1px solid var(--nous-shell-column-border, rgba(255,255,255,0.1))',
  background: 'var(--nous-bg, #0a0a0a)',
  color: 'var(--nous-text-primary, #fff)',
  fontSize: 'var(--nous-font-size-sm, 14px)',
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: '80px',
}

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs, 12px)',
  color: '#ef4444',
}

const errorBannerStyle: React.CSSProperties = {
  padding: 'var(--nous-space-sm, 8px) var(--nous-space-md, 16px)',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#ef4444',
  fontSize: 'var(--nous-font-size-sm, 14px)',
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--nous-space-sm, 8px)',
  paddingTop: 'var(--nous-space-md, 16px)',
}

const buttonPrimaryStyle: React.CSSProperties = {
  border: '1px solid #22c55e',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'rgba(34, 197, 94, 0.15)',
  color: '#22c55e',
  padding: 'var(--nous-space-sm, 8px) var(--nous-space-lg, 24px)',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-sm, 14px)',
  fontWeight: 'var(--nous-font-weight-medium, 500)',
}

const buttonSecondaryStyle: React.CSSProperties = {
  border: '1px solid var(--nous-shell-column-border, rgba(255,255,255,0.1))',
  borderRadius: 'var(--nous-radius-md, 8px)',
  background: 'var(--nous-catalog-card-bg, rgba(255,255,255,0.03))',
  color: 'var(--nous-text-secondary, #aaa)',
  padding: 'var(--nous-space-sm, 8px) var(--nous-space-lg, 24px)',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-sm, 14px)',
}
