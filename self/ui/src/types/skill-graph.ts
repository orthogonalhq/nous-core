export type NodeState = 'idle' | 'active' | 'waiting' | 'blocked' | 'complete' | 'approved' | 'needs-revision'
export type NodeType = 'orchestrator' | 'worker' | 'reviewer' | 'prompt-gen'
export type PacketType = 'dispatch' | 'handoff' | 'response_packet'

export interface SkillNode {
  id: string
  label: string
  type: NodeType
  state: NodeState
  cycle?: number
  agent?: string
  updatedAt?: string
}

export interface SkillEdge {
  id: string
  source: string
  target: string
  label?: string
  packetType: PacketType
}

export interface SkillGraph {
  skillId: string
  nodes: SkillNode[]
  edges: SkillEdge[]
  activeNodeId?: string
  snapshotAt: string
}
