// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWorkflowSync, RESERVED_NODE_DATA_KEYS } from '../hooks/useWorkflowSync'
import type { WorkflowSpec } from '@nous/shared'
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '../../../types/workflow-builder'

// ─── Test fixtures ──────────────────────────────────────────────────────────

const MULTI_NODE_SPEC: WorkflowSpec = {
  name: 'Test Workflow',
  version: 1,
  nodes: [
    {
      id: 'trigger-1',
      name: 'Webhook Trigger',
      type: 'nous.trigger.webhook',
      position: [100, 50],
      parameters: { path: '/api/hook', method: 'POST' },
    },
    {
      id: 'agent-1',
      name: 'Classify Intent',
      type: 'nous.agent.claude',
      position: [100, 250],
      parameters: {},
    },
    {
      id: 'condition-1',
      name: 'Is Urgent',
      type: 'nous.condition.if',
      position: [100, 450],
      parameters: {},
    },
  ],
  connections: [
    { from: 'trigger-1', to: 'agent-1' },
    { from: 'agent-1', to: 'condition-1', output: true },
  ],
}

const SINGLE_NODE_SPEC: WorkflowSpec = {
  name: 'Single Node',
  version: 1,
  nodes: [
    {
      id: 'node-a',
      name: 'Solo Node',
      type: 'nous.trigger.webhook',
      position: [0, 0],
      parameters: {},
    },
  ],
  connections: [],
}

const DISCONNECTED_SPEC: WorkflowSpec = {
  name: 'Disconnected Subgraphs',
  version: 1,
  nodes: [
    { id: 'a', name: 'Node A', type: 'nous.trigger.webhook', position: [0, 0], parameters: {} },
    { id: 'b', name: 'Node B', type: 'nous.agent.claude', position: [200, 0], parameters: {} },
    { id: 'c', name: 'Node C', type: 'nous.tool.memory-search', position: [0, 200], parameters: {} },
    { id: 'd', name: 'Node D', type: 'nous.memory.write', position: [200, 200], parameters: {} },
  ],
  connections: [
    { from: 'a', to: 'b' },
    { from: 'c', to: 'd' },
  ],
}

const VALID_YAML = `
name: Test Workflow
version: 1
nodes:
  - id: trigger-1
    name: Webhook Trigger
    type: nous.trigger.webhook
    position: [100, 50]
    parameters:
      path: /api/hook
      method: POST
  - id: agent-1
    name: Classify Intent
    type: nous.agent.claude
    position: [100, 250]
connections:
  - from: trigger-1
    to: agent-1
`

const INVALID_YAML = `
name: Bad Workflow
version: 1
nodes: "not an array"
`

const YAML_SYNTAX_ERROR = `
name: Bad
  version: 1
  : broken
`

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Deep-equal comparison after sorting object keys recursively */
function sortedDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
}

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(sortKeys)
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key])
    }
    return sorted
  }
  return obj
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useWorkflowSync', () => {
  // ─── Tier 1 — Contract ──────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('projectInbound returns correct node count, IDs, and positions', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(MULTI_NODE_SPEC)

      expect(nodes).toHaveLength(3)
      expect(edges).toHaveLength(2)

      // Check IDs
      expect(nodes.map((n) => n.id)).toEqual(['trigger-1', 'agent-1', 'condition-1'])

      // Check position mapping: [x, y] -> { x, y }
      expect(nodes[0].position).toEqual({ x: 100, y: 50 })
      expect(nodes[1].position).toEqual({ x: 100, y: 250 })
      expect(nodes[2].position).toEqual({ x: 100, y: 450 })
    })

    it('projectInbound maps data fields correctly', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes } = result.current.projectInbound(MULTI_NODE_SPEC)

      const triggerNode = nodes[0]
      expect(triggerNode.data.label).toBe('Webhook Trigger')
      expect(triggerNode.data.category).toBe('trigger')
      expect(triggerNode.data.nousType).toBe('nous.trigger.webhook')
      expect(triggerNode.type).toBe('builderNode')
    })

    it('projectInbound maps edge source/target/id correctly', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { edges } = result.current.projectInbound(MULTI_NODE_SPEC)

      expect(edges[0].source).toBe('trigger-1')
      expect(edges[0].target).toBe('agent-1')
      expect(edges[0].id).toBe('edge-trigger-1-agent-1')

      expect(edges[1].source).toBe('agent-1')
      expect(edges[1].target).toBe('condition-1')
      expect(edges[1].id).toBe('edge-agent-1-condition-1')
    })

    it('projectOutbound returns a valid WorkflowSpec structure', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(MULTI_NODE_SPEC)
      const spec = result.current.projectOutbound(nodes, edges, { name: 'Test Workflow', version: 1 })

      expect(spec.name).toBe('Test Workflow')
      expect(spec.version).toBe(1)
      expect(spec.nodes).toHaveLength(3)
      expect(spec.connections).toHaveLength(2)

      // Check outbound node structure
      expect(spec.nodes[0].id).toBe('trigger-1')
      expect(spec.nodes[0].name).toBe('Webhook Trigger')
      expect(spec.nodes[0].type).toBe('nous.trigger.webhook')
      expect(spec.nodes[0].position).toEqual([100, 50])
    })

    it('loadSpec returns success with nodes and edges for valid YAML', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const loadResult = result.current.loadSpec(VALID_YAML)

      expect(loadResult.success).toBe(true)
      expect(loadResult.nodes).toBeDefined()
      expect(loadResult.edges).toBeDefined()
      expect(loadResult.nodes!.length).toBeGreaterThan(0)
    })

    it('loadSpec returns failure with errors for invalid YAML schema', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const loadResult = result.current.loadSpec(INVALID_YAML)

      expect(loadResult.success).toBe(false)
      expect(loadResult.errors).toBeDefined()
      expect(loadResult.errors!.length).toBeGreaterThan(0)
    })

    it('serializeCurrentState returns a spec that passes validation', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(MULTI_NODE_SPEC)
      const serialized = result.current.serializeCurrentState(nodes, edges, {
        name: 'Test Workflow',
        version: 1,
      })

      expect(serialized.validationErrors).toEqual([])
      expect(serialized.spec).toBeDefined()
      expect(serialized.yaml).toBeTruthy()
    })

    it('round-trip: projectOutbound(projectInbound(spec)) is semantically identical', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(MULTI_NODE_SPEC)
      const roundTripped = result.current.projectOutbound(nodes, edges, {
        name: MULTI_NODE_SPEC.name,
        version: MULTI_NODE_SPEC.version,
      })

      // Compare semantically (sorted keys)
      expect(sortedDeepEqual(roundTripped.name, MULTI_NODE_SPEC.name)).toBe(true)
      expect(sortedDeepEqual(roundTripped.version, MULTI_NODE_SPEC.version)).toBe(true)
      expect(roundTripped.nodes).toHaveLength(MULTI_NODE_SPEC.nodes.length)
      expect(roundTripped.connections).toHaveLength(MULTI_NODE_SPEC.connections.length)

      // Check each node round-trips
      for (let i = 0; i < MULTI_NODE_SPEC.nodes.length; i++) {
        const original = MULTI_NODE_SPEC.nodes[i]
        const result = roundTripped.nodes[i]
        expect(result.id).toBe(original.id)
        expect(result.name).toBe(original.name)
        expect(result.type).toBe(original.type)
        expect(result.position).toEqual(original.position)
        expect(sortedDeepEqual(result.parameters, original.parameters)).toBe(true)
      }

      // Check connections round-trip
      for (let i = 0; i < MULTI_NODE_SPEC.connections.length; i++) {
        const original = MULTI_NODE_SPEC.connections[i]
        const result = roundTripped.connections[i]
        expect(result.from).toBe(original.from)
        expect(result.to).toBe(original.to)
        expect(result.output).toBe(original.output)
      }
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('inbound: parameters from spec spread into node.data', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes } = result.current.projectInbound(MULTI_NODE_SPEC)

      const triggerNode = nodes[0]
      expect(triggerNode.data.path).toBe('/api/hook')
      expect(triggerNode.data.method).toBe('POST')
    })

    it('outbound: reserved keys are NOT written to parameters', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(MULTI_NODE_SPEC)

      // Add a description to a node (reserved key)
      const modifiedNodes = nodes.map((n, i) =>
        i === 0 ? { ...n, data: { ...n.data, description: 'Test description' } } : n,
      )

      const spec = result.current.projectOutbound(modifiedNodes, edges, {
        name: 'Test',
        version: 1,
      })

      // description should NOT be in parameters
      expect(spec.nodes[0].parameters).not.toHaveProperty('description')
      // label, category, nousType should NOT be in parameters
      expect(spec.nodes[0].parameters).not.toHaveProperty('label')
      expect(spec.nodes[0].parameters).not.toHaveProperty('category')
      expect(spec.nodes[0].parameters).not.toHaveProperty('nousType')
    })

    it('inbound: edge labels derived from connection output field', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { edges } = result.current.projectInbound(MULTI_NODE_SPEC)

      // Connection with output: true -> label 'true'
      const labeledEdge = edges[1]
      expect(labeledEdge.data?.label).toBe('true')

      // Connection without output -> no label
      const unlabeledEdge = edges[0]
      expect(unlabeledEdge.data?.label).toBeUndefined()
    })

    it('outbound: spec.name and spec.version preserved', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(MULTI_NODE_SPEC)
      const spec = result.current.projectOutbound(nodes, edges, {
        name: 'Custom Name',
        version: 1,
      })

      expect(spec.name).toBe('Custom Name')
      expect(spec.version).toBe(1)
    })

    it('validation errors surfaced for structurally invalid graph', () => {
      const { result } = renderHook(() => useWorkflowSync())

      // Create nodes with a dangling connection reference
      const nodes: WorkflowBuilderNode[] = [
        {
          id: 'node-only',
          type: 'builderNode',
          position: { x: 0, y: 0 },
          data: { label: 'Test', category: 'trigger', nousType: 'nous.trigger.webhook' },
        },
      ]
      const edges: WorkflowBuilderEdge[] = [
        {
          id: 'e-node-only-nonexistent',
          source: 'node-only',
          target: 'nonexistent',
          data: { edgeType: 'execution' },
        },
      ]

      const serialized = result.current.serializeCurrentState(nodes, edges, {
        name: 'Bad Graph',
        version: 1,
      })

      expect(serialized.validationErrors.length).toBeGreaterThan(0)
    })
  })

  // ─── Tier 3 — Edge Cases ───────────────────────────────────────────────

  describe('Tier 3 — Edge Cases', () => {
    it('single node spec round-trips correctly', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(SINGLE_NODE_SPEC)

      expect(nodes).toHaveLength(1)
      expect(edges).toHaveLength(0)

      const roundTripped = result.current.projectOutbound(nodes, edges, {
        name: SINGLE_NODE_SPEC.name,
        version: SINGLE_NODE_SPEC.version,
      })

      expect(roundTripped.nodes).toHaveLength(1)
      expect(roundTripped.connections).toHaveLength(0)
      expect(roundTripped.nodes[0].id).toBe('node-a')
    })

    it('disconnected subgraphs: all nodes present, edges within groups only', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(DISCONNECTED_SPEC)

      expect(nodes).toHaveLength(4)
      expect(edges).toHaveLength(2)
      expect(edges[0].source).toBe('a')
      expect(edges[0].target).toBe('b')
      expect(edges[1].source).toBe('c')
      expect(edges[1].target).toBe('d')
    })

    it('node with empty parameters round-trips as empty', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(SINGLE_NODE_SPEC)
      const spec = result.current.projectOutbound(nodes, edges, {
        name: SINGLE_NODE_SPEC.name,
        version: 1,
      })

      // Parameters should be empty (not undefined)
      expect(spec.nodes[0].parameters).toEqual({})
    })

    it('description field is NOT serialized to parameters', () => {
      const { result } = renderHook(() => useWorkflowSync())

      const nodes: WorkflowBuilderNode[] = [
        {
          id: 'test-node',
          type: 'builderNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Test',
            category: 'trigger',
            nousType: 'nous.trigger.webhook',
            description: 'This should not appear in parameters',
          },
        },
      ]

      const spec = result.current.projectOutbound(nodes, [], { name: 'Test', version: 1 })
      expect(spec.nodes[0].parameters).not.toHaveProperty('description')
    })

    it('loadSpec returns failure for YAML syntax errors', () => {
      const { result } = renderHook(() => useWorkflowSync())
      const loadResult = result.current.loadSpec(YAML_SYNTAX_ERROR)

      expect(loadResult.success).toBe(false)
      expect(loadResult.errors).toBeDefined()
    })

    it('RESERVED_NODE_DATA_KEYS contains expected keys', () => {
      expect(RESERVED_NODE_DATA_KEYS.has('label')).toBe(true)
      expect(RESERVED_NODE_DATA_KEYS.has('category')).toBe(true)
      expect(RESERVED_NODE_DATA_KEYS.has('description')).toBe(true)
      expect(RESERVED_NODE_DATA_KEYS.has('nousType')).toBe(true)
    })

    it('outbound: boolean output values round-trip through edge labels', () => {
      const specWithBoolOutputs: WorkflowSpec = {
        name: 'Bool Test',
        version: 1,
        nodes: [
          { id: 'a', name: 'A', type: 'nous.condition.if', position: [0, 0], parameters: {} },
          { id: 'b', name: 'B', type: 'nous.agent.claude', position: [100, 0], parameters: {} },
          { id: 'c', name: 'C', type: 'nous.agent.claude', position: [200, 0], parameters: {} },
        ],
        connections: [
          { from: 'a', to: 'b', output: true },
          { from: 'a', to: 'c', output: false },
        ],
      }

      const { result } = renderHook(() => useWorkflowSync())
      const { nodes, edges } = result.current.projectInbound(specWithBoolOutputs)
      const roundTripped = result.current.projectOutbound(nodes, edges, {
        name: specWithBoolOutputs.name,
        version: 1,
      })

      expect(roundTripped.connections[0].output).toBe(true)
      expect(roundTripped.connections[1].output).toBe(false)
    })
  })
})
