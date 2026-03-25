// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { BaseNode } from '../nodes/BaseNode'
import type { NodeCategory, WorkflowBuilderNodeData } from '../../../types/workflow-builder'

const ALL_CATEGORIES: NodeCategory[] = [
  'trigger',
  'agent',
  'condition',
  'app',
  'tool',
  'memory',
  'governance',
]

const NOUS_TYPE_MAP: Record<NodeCategory, string> = {
  trigger: 'nous.trigger.webhook',
  agent: 'nous.agent.classify',
  condition: 'nous.condition.branch',
  app: 'nous.app.slack-notify',
  tool: 'nous.tool.vector-search',
  memory: 'nous.memory.write',
  governance: 'nous.governance.audit-log',
}

function makeNodeProps(category: NodeCategory, overrides?: Partial<WorkflowBuilderNodeData>) {
  const data: WorkflowBuilderNodeData = {
    label: `Test ${category} Node`,
    category,
    nousType: NOUS_TYPE_MAP[category],
    description: `A test ${category} node description`,
    ...overrides,
  }

  // Minimal NodeProps shape that BaseNode actually consumes
  return {
    id: `test-${category}`,
    data,
    type: 'builderNode',
    selected: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as any
}

describe('BaseNode', () => {
  // ─── Tier 1 — Contract ──────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it.each(ALL_CATEGORIES)(
      'renders without crashing for category "%s"',
      (category) => {
        const props = makeNodeProps(category)
        const MemoBaseNode = BaseNode as React.ComponentType<any>
        expect(() => render(<MemoBaseNode {...props} />)).not.toThrow()
      },
    )
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('renders the node label text', () => {
      const props = makeNodeProps('agent')
      const MemoBaseNode = BaseNode as React.ComponentType<any>
      render(<MemoBaseNode {...props} />)
      expect(screen.getByText('Test agent Node')).toBeTruthy()
    })

    it('renders the node description text', () => {
      const props = makeNodeProps('trigger')
      const MemoBaseNode = BaseNode as React.ComponentType<any>
      render(<MemoBaseNode {...props} />)
      expect(screen.getByText('A test trigger node description')).toBeTruthy()
    })
  })

  // ─── Tier 3 — Edge Case ────────────────────────────────────────────────────

  describe('Tier 3 — Edge Case', () => {
    it('renders without crashing when description is undefined', () => {
      const props = makeNodeProps('tool', { description: undefined })
      const MemoBaseNode = BaseNode as React.ComponentType<any>
      expect(() => render(<MemoBaseNode {...props} />)).not.toThrow()
    })
  })
})
