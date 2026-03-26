// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { z } from 'zod'
import { ParameterForm } from '../inspectors/ParameterForm'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderForm(
  schema: z.ZodObject<z.ZodRawShape>,
  values: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  const onChange = vi.fn()
  const result = render(
    <ParameterForm
      schema={schema}
      values={values}
      onChange={onChange}
      {...overrides}
    />,
  )
  return { ...result, onChange }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ParameterForm', () => {
  // ─── Tier 1 — Contract ────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders text input for ZodString field', () => {
      const schema = z.object({ name: z.string() })
      renderForm(schema)
      const input = screen.getByTestId('input-name')
      expect(input.getAttribute('type')).toBe('text')
    })

    it('renders number input for ZodNumber field', () => {
      const schema = z.object({ count: z.number() })
      renderForm(schema)
      const input = screen.getByTestId('input-count')
      expect(input.getAttribute('type')).toBe('number')
    })

    it('renders checkbox for ZodBoolean field', () => {
      const schema = z.object({ enabled: z.boolean() })
      renderForm(schema)
      const input = screen.getByTestId('input-enabled')
      expect(input.getAttribute('type')).toBe('checkbox')
    })

    it('renders select for ZodEnum field with correct options', () => {
      const schema = z.object({ level: z.enum(['low', 'medium', 'high']) })
      renderForm(schema)
      const select = screen.getByTestId('input-level')
      expect(select.tagName).toBe('SELECT')
      // Should have 3 options + the placeholder "Select..."
      expect(select.querySelectorAll('option').length).toBe(4)
    })

    it('renders textarea fallback for ZodRecord field', () => {
      const schema = z.object({ headers: z.record(z.string(), z.string()) })
      renderForm(schema)
      const textarea = screen.getByTestId('input-headers')
      expect(textarea.tagName).toBe('TEXTAREA')
    })

    it('renders textarea fallback for unknown Zod type', () => {
      const schema = z.object({ data: z.unknown() })
      renderForm(schema)
      const textarea = screen.getByTestId('input-data')
      expect(textarea.tagName).toBe('TEXTAREA')
    })

    it('unwraps ZodOptional and renders inner control', () => {
      const schema = z.object({ hint: z.string().optional() })
      renderForm(schema)
      const input = screen.getByTestId('input-hint')
      expect(input.getAttribute('type')).toBe('text')
    })

    it('calls onChange with patch when field value changes', () => {
      const schema = z.object({ name: z.string() })
      const { onChange } = renderForm(schema)
      const input = screen.getByTestId('input-name')
      fireEvent.change(input, { target: { value: 'hello' } })
      expect(onChange).toHaveBeenCalledWith({ name: 'hello' })
    })

    it('displays validationError message for the correct field', () => {
      const schema = z.object({ name: z.string() })
      renderForm(schema, {}, { validationErrors: { name: 'Name is required' } })
      expect(screen.getByTestId('error-name')).toBeTruthy()
      expect(screen.getByText('Name is required')).toBeTruthy()
    })

    it('renders all fields as read-only when readOnly prop is true', () => {
      const schema = z.object({ name: z.string() })
      renderForm(schema, {}, { readOnly: true })
      const input = screen.getByTestId('input-name') as HTMLInputElement
      expect(input.readOnly).toBe(true)
    })

    it('renders BindingPopover trigger for field named "skill"', () => {
      const schema = z.object({ skill: z.string() })
      renderForm(schema)
      expect(screen.getByTestId('binding-trigger-skill')).toBeTruthy()
    })

    it('renders BindingPopover trigger for field named "contract"', () => {
      const schema = z.object({ contract: z.string() })
      renderForm(schema)
      expect(screen.getByTestId('binding-trigger-contract')).toBeTruthy()
    })

    it('renders BindingPopover trigger for field named "template"', () => {
      const schema = z.object({ template: z.string() })
      renderForm(schema)
      expect(screen.getByTestId('binding-trigger-template')).toBeTruthy()
    })

    it('does not crash for empty schema (no fields)', () => {
      const schema = z.object({})
      renderForm(schema)
      expect(screen.getByText('No parameters')).toBeTruthy()
    })
  })

  // ─── Tier 3 — Edge Case ──────────────────────────────────────────────────

  describe('Tier 3 — Edge Case', () => {
    it('per-field Zod validation error is cleared when field value is corrected', () => {
      const schema = z.object({ name: z.string() })
      const { rerender, onChange } = renderForm(schema, {}, { validationErrors: { name: 'Required' } })
      expect(screen.getByText('Required')).toBeTruthy()

      // Re-render without error
      rerender(
        <ParameterForm
          schema={schema}
          values={{ name: 'fixed' }}
          onChange={onChange}
          validationErrors={{}}
        />,
      )
      expect(screen.queryByTestId('error-name')).toBeNull()
    })

    it('ZodOptional(ZodString) renders text input (not required) without crashing', () => {
      const schema = z.object({ hint: z.string().optional() })
      renderForm(schema)
      const input = screen.getByTestId('input-hint')
      expect(input).toBeTruthy()
      // Should not show required indicator
      const field = screen.getByTestId('field-hint')
      expect(field.querySelector('span[style*="color"]')?.textContent).not.toBe(' *')
    })
  })
})
