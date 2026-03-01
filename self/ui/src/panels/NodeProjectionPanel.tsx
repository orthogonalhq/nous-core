'use client'

import { useState } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import type { SkillGraph, NodeState } from '../types/skill-graph'

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

const STATE_COLORS: Record<NodeState, string> = {
  idle: '#3f3f46',
  active: '#2563eb',
  waiting: '#d97706',
  blocked: '#dc2626',
  complete: '#16a34a',
  approved: '#0891b2',
  'needs-revision': '#9333ea',
}

interface NodeProjectionPanelProps extends IDockviewPanelProps {
  params?: { graph?: SkillGraph }
}

export function NodeProjectionPanel({ params }: NodeProjectionPanelProps) {
  const graph = params?.graph ?? DEMO_SKILL_GRAPH
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#18181b', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #3f3f46', fontSize: '12px', color: '#a1a1aa', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>Node Projection</span>
        <span style={{ color: '#52525b' }}>{graph.skillId}</span>
      </div>
      {/* Graph */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <svg viewBox="0 0 600 340" style={{ width: '100%', maxWidth: '600px', height: 'auto' }}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#52525b" />
            </marker>
          </defs>
          {/* Edges */}
          {graph.edges.map(edge => {
            const from = NODE_POSITIONS[edge.source]
            const to = NODE_POSITIONS[edge.target]
            if (!from || !to) return null
            // Offset line ends to node edge (half-width=40, half-height=16)
            const dx = to.x - from.x
            const dy = to.y - from.y
            const len = Math.sqrt(dx * dx + dy * dy)
            const ux = dx / len, uy = dy / len
            const x1 = from.x + ux * 40, y1 = from.y + uy * 16
            const x2 = to.x - ux * 48, y2 = to.y - uy * 20
            return (
              <g key={edge.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3f3f46" strokeWidth="1.5" markerEnd="url(#arrow)" />
                {edge.label && (
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fill="#52525b" fontSize="9" textAnchor="middle">{edge.label}</text>
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
                {isActive && <rect x="-4" y="-4" width="88" height="40" rx="10" fill="none" stroke="#60a5fa" strokeWidth="2.5" opacity="0.5" />}
                <rect width="80" height="32" rx="7" fill={STATE_COLORS[node.state]} />
                <text x="40" y="21" fill="white" fontSize="10" fontWeight={600} textAnchor="middle">{node.label}</text>
                {isHovered && (
                  <title>{`${node.id} · ${node.type} · ${node.state}${node.cycle ? ` · cycle ${node.cycle}` : ''}`}</title>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {/* Footer */}
      <div style={{ padding: '6px 16px', borderTop: '1px solid #3f3f46', fontSize: '11px', color: '#52525b', display: 'flex', justifyContent: 'space-between' }}>
        <span>{graph.nodes.length} nodes · {graph.edges.length} edges</span>
        <span>{new Date(graph.snapshotAt).toLocaleTimeString()}</span>
      </div>
    </div>
  )
}
