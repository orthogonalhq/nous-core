/**
 * Shared integration test utilities for Workflow Builder.
 *
 * Integration tests render WorkflowBuilderPanel at the top level inside
 * the mocked ReactFlowProvider, exercising the full component tree.
 */
import { vi } from 'vitest'
import React from 'react'
import { render, act } from '@testing-library/react'

// ─── Re-export the react-flow mock ────────────────────────────────────────────

export { reactFlowMock } from '../react-flow-mock'

// ─── Render helper ────────────────────────────────────────────────────────────

/**
 * Renders WorkflowBuilderPanel inside the test environment.
 * Must be called AFTER vi.mock('@xyflow/react', ...) in the test file.
 */
export function renderCanvas() {
  // Dynamic import so mock is applied before the module is loaded
  const { WorkflowBuilderPanel } = require('../../WorkflowBuilderPanel')
  return render(React.createElement(WorkflowBuilderPanel))
}

// ─── Keyboard shortcut helper ─────────────────────────────────────────────────

/**
 * Fires a keydown event on the window with the specified key and modifiers.
 */
export function triggerKeyboardShortcut(
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: modifiers.ctrl ?? false,
    shiftKey: modifiers.shift ?? false,
    metaKey: modifiers.meta ?? false,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
}

// ─── State flush helper ───────────────────────────────────────────────────────

/**
 * Wraps act(() => {}) to flush pending state updates.
 */
export async function waitForStateUpdate() {
  await act(async () => {
    // Allow microtasks and React state updates to flush
  })
}

// ─── Common mock factories ────────────────────────────────────────────────────

/**
 * Creates a standard @nous/shared mock for integration tests.
 */
export function createSharedMock() {
  return {
    resolveNodeTypeParameterSchema: (_nodeType: string) => {
      // Return a minimal Zod-like schema stub
      return {
        safeParse: (_data: unknown) => ({ success: true, data: {} }),
        shape: {},
      }
    },
    validateWorkflowSpec: vi.fn(() => []),
  }
}

/**
 * Creates a standard node-registry mock for integration tests.
 */
export function createNodeRegistryMock() {
  return {
    getAllRegistryEntries: () => [
      ['nous.trigger.webhook', {
        category: 'trigger' as const,
        defaultLabel: 'Webhook Trigger',
        icon: 'codicon-zap',
        colorVar: 'var(--c)',
        width: 200,
        height: 80,
        ports: [
          { id: 'out-0', type: 'source', position: 'bottom', label: 'Out' },
        ],
      }],
      ['nous.agent.claude', {
        category: 'agent' as const,
        defaultLabel: 'Claude Agent',
        icon: 'codicon-hubot',
        colorVar: 'var(--c)',
        width: 200,
        height: 80,
        ports: [
          { id: 'in-0', type: 'target', position: 'top', label: 'In' },
          { id: 'out-0', type: 'source', position: 'bottom', label: 'Out' },
        ],
      }],
      ['nous.condition.if', {
        category: 'condition' as const,
        defaultLabel: 'If Condition',
        icon: 'codicon-git-compare',
        colorVar: 'var(--c)',
        width: 200,
        height: 80,
        ports: [
          { id: 'in-0', type: 'target', position: 'top', label: 'In' },
          { id: 'out-0', type: 'source', position: 'bottom', label: 'True' },
          { id: 'out-1', type: 'source', position: 'bottom', label: 'False' },
        ],
      }],
    ],
    getRegistryEntry: (nousType: string) => {
      const entries = createNodeRegistryMock().getAllRegistryEntries()
      const found = entries.find(([type]) => type === nousType)
      return found ? found[1] : {
        category: 'agent' as const,
        defaultLabel: nousType,
        icon: 'codicon-symbol-method',
        colorVar: 'var(--c)',
        width: 200,
        height: 80,
        ports: [],
      }
    },
  }
}
