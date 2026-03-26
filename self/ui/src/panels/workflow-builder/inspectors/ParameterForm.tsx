'use client'

import React, { useCallback, useMemo } from 'react'
import type { z } from 'zod'
import type { ParameterFormProps, BindingOption } from '../../../types/workflow-builder'
import { BindingPopover } from './BindingPopover'

// ─── Styles ──────────────────────────────────────────────────────────────────

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-sm)' as unknown as string,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  color: 'var(--nous-fg-muted)',
  fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  padding: 'var(--nous-space-xs) var(--nous-space-sm)' as unknown as string,
  background: 'var(--nous-bg-input)',
  border: '1px solid var(--nous-border)',
  borderRadius: 'var(--nous-radius-sm)' as unknown as string,
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)' as unknown as string,
  width: '100%',
  boxSizing: 'border-box' as const,
}

const errorStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  color: 'var(--nous-error)',
}

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)' as unknown as string,
}

const bindingFieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)' as unknown as string,
}

// ─── Binding field detection ─────────────────────────────────────────────────

const BINDING_FIELD_NAMES = new Set(['skill', 'contract', 'template'])

function isBindingField(fieldName: string): boolean {
  return BINDING_FIELD_NAMES.has(fieldName)
}

function getBindingKind(fieldName: string): 'skill' | 'contract' | 'template' {
  return fieldName as 'skill' | 'contract' | 'template'
}

// ─── Zod type introspection ──────────────────────────────────────────────────

interface ZodFieldInfo {
  typeName: string
  isOptional: boolean
  innerDef: Record<string, unknown>
  options?: string[]
  literalValue?: unknown
}

function introspectZodField(fieldSchema: z.ZodTypeAny): ZodFieldInfo {
  const def = fieldSchema._def as Record<string, unknown>
  let typeName = def.typeName as string
  let isOptional = false
  let innerDef = def
  let options: string[] | undefined
  let literalValue: unknown

  // Unwrap ZodOptional
  if (typeName === 'ZodOptional') {
    isOptional = true
    const innerType = (def.innerType as z.ZodTypeAny)
    innerDef = innerType._def as Record<string, unknown>
    typeName = innerDef.typeName as string
  }

  // Unwrap ZodDefault
  if (typeName === 'ZodDefault') {
    const innerType = (innerDef.innerType as z.ZodTypeAny)
    innerDef = innerType._def as Record<string, unknown>
    typeName = innerDef.typeName as string
  }

  // Extract enum options
  if (typeName === 'ZodEnum') {
    options = (innerDef.values as string[]) ?? []
  }

  // Extract literal value
  if (typeName === 'ZodLiteral') {
    literalValue = innerDef.value
  }

  return { typeName, isOptional, innerDef, options, literalValue }
}

function hasUrlCheck(innerDef: Record<string, unknown>): boolean {
  const checks = innerDef.checks as Array<{ kind: string }> | undefined
  return checks?.some((c) => c.kind === 'url') ?? false
}

// ─── Component ───────────────────────────────────────────────────────────────

function ParameterFormInner({
  schema,
  values,
  validationErrors,
  onChange,
  readOnly,
}: ParameterFormProps) {
  const fields = useMemo(() => {
    try {
      return Object.entries(schema.shape)
    } catch {
      return []
    }
  }, [schema])

  const handleChange = useCallback(
    (fieldName: string, value: unknown) => {
      onChange({ [fieldName]: value })
    },
    [onChange],
  )

  const handleBindingSelect = useCallback(
    (fieldName: string, bindingValue: string) => {
      onChange({ [fieldName]: bindingValue })
    },
    [onChange],
  )

  const handleBindingClear = useCallback(
    (fieldName: string) => {
      onChange({ [fieldName]: undefined })
    },
    [onChange],
  )

  if (fields.length === 0) {
    return (
      <div style={formStyle} data-testid="parameter-form">
        <span style={labelStyle}>No parameters</span>
      </div>
    )
  }

  return (
    <div style={formStyle} data-testid="parameter-form">
      {fields.map(([fieldName, fieldSchema]) => {
        const info = introspectZodField(fieldSchema as z.ZodTypeAny)
        const currentValue = values[fieldName]
        const error = validationErrors?.[fieldName]
        const isBinding = isBindingField(fieldName)

        return (
          <div key={fieldName} style={fieldStyle} data-testid={`field-${fieldName}`}>
            <label style={labelStyle} htmlFor={`param-${fieldName}`}>
              {fieldName}
              {!info.isOptional && <span style={{ color: 'var(--nous-error)' }}> *</span>}
            </label>

            {isBinding ? (
              <div style={bindingFieldStyle}>
                <input
                  id={`param-${fieldName}`}
                  type="text"
                  style={{ ...inputStyle, flex: 1 }}
                  value={typeof currentValue === 'string' ? currentValue : ''}
                  onChange={(e) => handleChange(fieldName, e.target.value)}
                  readOnly={readOnly}
                  aria-label={`${fieldName} parameter`}
                  data-testid={`input-${fieldName}`}
                />
                <BindingPopover
                  fieldName={fieldName}
                  value={typeof currentValue === 'string' ? currentValue : undefined}
                  options={[] as BindingOption[]}
                  onSelect={(v) => handleBindingSelect(fieldName, v)}
                  onClear={() => handleBindingClear(fieldName)}
                />
              </div>
            ) : (
              renderControl(fieldName, info, currentValue, handleChange, readOnly)
            )}

            {error && (
              <span style={errorStyle} data-testid={`error-${fieldName}`} role="alert">
                {error}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function renderControl(
  fieldName: string,
  info: ZodFieldInfo,
  currentValue: unknown,
  handleChange: (fieldName: string, value: unknown) => void,
  readOnly?: boolean,
): React.ReactNode {
  const { typeName, innerDef, options, literalValue } = info

  switch (typeName) {
    case 'ZodString': {
      const isUrl = hasUrlCheck(innerDef)
      return (
        <input
          id={`param-${fieldName}`}
          type={isUrl ? 'url' : 'text'}
          style={inputStyle}
          value={typeof currentValue === 'string' ? currentValue : ''}
          onChange={(e) => handleChange(fieldName, e.target.value)}
          readOnly={readOnly}
          aria-label={`${fieldName} parameter`}
          data-testid={`input-${fieldName}`}
        />
      )
    }

    case 'ZodNumber':
      return (
        <input
          id={`param-${fieldName}`}
          type="number"
          style={inputStyle}
          value={typeof currentValue === 'number' ? currentValue : ''}
          onChange={(e) => handleChange(fieldName, e.target.value === '' ? undefined : Number(e.target.value))}
          readOnly={readOnly}
          aria-label={`${fieldName} parameter`}
          data-testid={`input-${fieldName}`}
        />
      )

    case 'ZodBoolean':
      return (
        <div style={checkboxRowStyle}>
          <input
            id={`param-${fieldName}`}
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => handleChange(fieldName, e.target.checked)}
            disabled={readOnly}
            aria-label={`${fieldName} parameter`}
            data-testid={`input-${fieldName}`}
          />
          <label htmlFor={`param-${fieldName}`} style={labelStyle}>
            {fieldName}
          </label>
        </div>
      )

    case 'ZodEnum':
      return (
        <select
          id={`param-${fieldName}`}
          style={inputStyle}
          value={typeof currentValue === 'string' ? currentValue : ''}
          onChange={(e) => handleChange(fieldName, e.target.value)}
          disabled={readOnly}
          aria-label={`${fieldName} parameter`}
          data-testid={`input-${fieldName}`}
        >
          <option value="">Select...</option>
          {options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )

    case 'ZodUnion':
      return (
        <select
          id={`param-${fieldName}`}
          style={inputStyle}
          value={String(currentValue ?? '')}
          onChange={(e) => handleChange(fieldName, e.target.value)}
          disabled={readOnly}
          aria-label={`${fieldName} parameter`}
          data-testid={`input-${fieldName}`}
        >
          <option value="">Select...</option>
        </select>
      )

    case 'ZodLiteral':
      return (
        <input
          id={`param-${fieldName}`}
          type="text"
          style={inputStyle}
          value={String(literalValue ?? '')}
          readOnly
          aria-label={`${fieldName} parameter`}
          data-testid={`input-${fieldName}`}
        />
      )

    case 'ZodRecord':
    case 'ZodUnknown':
    default:
      return (
        <textarea
          id={`param-${fieldName}`}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue ?? '', null, 2)}
          onChange={(e) => {
            try {
              handleChange(fieldName, JSON.parse(e.target.value))
            } catch {
              handleChange(fieldName, e.target.value)
            }
          }}
          readOnly={readOnly}
          aria-label={`${fieldName} parameter`}
          data-testid={`input-${fieldName}`}
        />
      )
  }
}

export const ParameterForm = React.memo(ParameterFormInner)
