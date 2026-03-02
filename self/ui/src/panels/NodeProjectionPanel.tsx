'use client'

import { useState } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import type { SkillGraph, NodeState } from '../types/skill-graph'
import { tokens } from '../tokens/index'

const DEMO_SKILL_GRAPH: SkillGraph = {
  skillId: 'engineer-workflow-sop::nous-core::phase-7',
  nodes: [
    { id: 'orchestrator', label: 'Orchestrator', type: 'orchestrator', state: 'active', cycle: 2 },
    { id: 'prompt-gen', label: 'PromptGen', type: 'prompt-gen', state: 'complete', cycle: 1 },
    { id: 'sds-worker', label: 'SDS Worker', type: 'worker', state: 'complete', cycle: 1 },
    { id: 'plan-worker', label: 'Plan Worker', type: 'worker', state: 'complete', cycle: 1 },
    { id: 'impl-worker', label: 'Impl Worker', type: 'worker', state: 'active', cycle: 2 },
    { id: 'reviewer', label: 'Reviewer', type: 'reviewer', state: 'waiting', cycle: 2 },
  ],
  edges: [
    { id: 'e1', source: 'orchestrator', target: 'prompt-gen', packetType: 'dispatch', label: 'dispatch' },
    { id: 'e2', source: 'prompt-gen', target: 'sds-worker', packetType: 'handoff', label: 'handoff' },
    { id: 'e3', source: 'sds-worker', target: 'orchestrator', packetType: 'response_packet', label: 'response' },
    { id: 'e4', source: 'orchestrator', target: 'impl-worker', packetType: 'dispatch', label: 'dispatch' },
    { id: 'e5', source: 'impl-worker', target: 'reviewer', packetType: 'handoff', label: 'handoff' },
  ],
  activeNodeId: 'impl-worker',
  snapshotAt: new Date().toISOString(),
}

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  orchestrator: { x: 300, y: 60 },
  'prompt-gen': { x: 150, y: 160 },
  'sds-worker': { x: 300, y: 160 },
  'plan-worker': { x: 450, y: 160 },
  'impl-worker': { x: 200, y: 260 },
  reviewer: { x: 400, y: 260 },
}

// SVG cannot use CSS var() in fill attributes — use the JS token mirror instead
const STATE_FILL: Record<NodeState, string> = {
  idle:             tokens.colors.stateFill.idle,
  active:           tokens.colors.stateFill.active,
  waiting:          tokens.colors.stateFill.waiting,
  blocked:          tokens.colors.stateFill.blocked,
  complete:         tokens.colors.stateFill.complete,
  approved:         tokens.colors.stateFill.approved,
  'needs-revision': tokens.colors.stateFill.needsRevision,
}

interface NodeProjectionPanelProps extends IDockviewPanelProps {
  params?: { graph?: SkillGraph }
}

export function NodeProjectionPanel({ params }: NodeProjectionPanelProps) {
  const graph = params?.graph ?? DEMO_SKILL_GRAPH
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--nous-fg)' }}>
      {/* Header */}
      <div style={{ padding: 'var(--nous-space-md) var(--nous-space-2xl)', borderBottom: '1px solid var(--nous-border)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)', display: 'flex', justifyContent: 'space-between', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as any }}>Node Projection</span>
        <span style={{ color: 'var(--nous-fg-subtle)', textTransform: 'none', letterSpacing: 0 }}>{graph.skillId}</span>
      </div>
      {/* Graph */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--nous-space-2xl)' }}>
        <svg viewBox="0 0 600 340" style={{ width: '100%', maxWidth: '600px', height: 'auto' }}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={tokens.colors.fgSubtle} />
            </marker>
          </defs>
          {/* Edges */}
          {graph.edges.map(edge => {
            const from = NODE_POSITIONS[edge.source]
            const to = NODE_POSITIONS[edge.target]
            if (!from || !to) return null
            const dx = to.x - from.x
            const dy = to.y - from.y
            const len = Math.sqrt(dx * dx + dy * dy)
            const ux = dx / len, uy = dy / len
            const x1 = from.x + ux * 40, y1 = from.y + uy * 16
            const x2 = to.x - ux * 48, y2 = to.y - uy * 20
            return (
              <g key={edge.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tokens.colors.border} strokeWidth="1.5" markerEnd="url(#arrow)" />
                {edge.label && (
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fill={tokens.colors.fgSubtle} fontSize="9" textAnchor="middle">{edge.label}</text>
                )}
              </g>
            )
          })}
          {/* Nodes */}
          {graph.nodes.map(node => {
            const pos = NODE_POSITIONS[node.id]
            if (!pos) return null
            const isActive = graph.activeNodeId === node.id
            const isHovered = hoveredNode === node.id
            return (
              <g key={node.id} transform={`translate(${pos.x - 40}, ${pos.y - 16})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'default' }}>
                {isActive && <rect x="-4" y="-4" width="88" height="40" rx="10" fill="none" stroke={tokens.colors.accent} strokeWidth="2" opacity="0.6" />}
                <rect width="80" height="32" rx="5" fill={STATE_FILL[node.state]} />
                <text x="40" y="21" fill={tokens.colors.fgOnColor} fontSize="10" fontWeight={600} textAnchor="middle">{node.label}</text>
                {isHovered && (
                  <title>{`${node.id} · ${node.type} · ${node.state}${node.cycle ? ` · cycle ${node.cycle}` : ''}`}</title>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {/* Footer */}
      <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-2xl)', borderTop: '1px solid var(--nous-border)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{graph.nodes.length} nodes · {graph.edges.length} edges</span>
        <span>{new Date(graph.snapshotAt).toLocaleTimeString()}</span>
      </div>
    </div>
  )
}
