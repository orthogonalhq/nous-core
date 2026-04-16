import { describe, expect, it } from 'vitest'
import { computeConnectedComponents } from '../workflow-graph-utils'
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '../../../types/workflow-builder'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string): WorkflowBuilderNode {
  return {
    id,
    type: 'builderNode',
    position: { x: 0, y: 0 },
    data: { label: id, category: 'tool', nousType: `nous.tool.${id}` },
  }
}

function makeEdge(source: string, target: string): WorkflowBuilderEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'builderEdge',
    data: { edgeType: 'execution' },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeConnectedComponents', () => {
  // ─── Tier 1 — Contract ────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('returns 0 for empty nodes/edges', () => {
      expect(computeConnectedComponents([], [])).toBe(0)
    })

    it('returns 1 for a single node', () => {
      expect(computeConnectedComponents([makeNode('a')], [])).toBe(1)
    })

    it('returns 1 for a fully connected graph', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]
      expect(computeConnectedComponents(nodes, edges)).toBe(1)
    })

    it('returns N for N isolated nodes', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
      expect(computeConnectedComponents(nodes, [])).toBe(3)
    })

    it('returns correct count for a graph with two disconnected subgraphs', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')]
      const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')]
      expect(computeConnectedComponents(nodes, edges)).toBe(2)
    })

    it('handles edges referencing nodes not in nodes array (graceful — excludes orphan edges)', () => {
      const nodes = [makeNode('a'), makeNode('b')]
      const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')] // c and d not in nodes
      expect(computeConnectedComponents(nodes, edges)).toBe(1)
    })
  })
})
