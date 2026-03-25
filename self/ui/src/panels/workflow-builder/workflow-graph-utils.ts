import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '../../types/workflow-builder'

/**
 * Computes the number of connected components in the workflow graph
 * using disjoint set union (union-find).
 *
 * Pure function — no React dependencies.
 */
export function computeConnectedComponents(
  nodes: WorkflowBuilderNode[],
  edges: WorkflowBuilderEdge[],
): number {
  if (nodes.length === 0) return 0

  // Build parent map from node IDs
  const parent = new Map<string, string>()
  const rank = new Map<string, number>()

  for (const node of nodes) {
    parent.set(node.id, node.id)
    rank.set(node.id, 0)
  }

  function find(x: string): string {
    let root = x
    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }
    // Path compression
    let current = x
    while (current !== root) {
      const next = parent.get(current)!
      parent.set(current, root)
      current = next
    }
    return root
  }

  function union(a: string, b: string): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA === rootB) return

    const rankA = rank.get(rootA)!
    const rankB = rank.get(rootB)!
    if (rankA < rankB) {
      parent.set(rootA, rootB)
    } else if (rankA > rankB) {
      parent.set(rootB, rootA)
    } else {
      parent.set(rootB, rootA)
      rank.set(rootA, rankA + 1)
    }
  }

  // Union connected nodes via edges (skip edges referencing unknown nodes)
  for (const edge of edges) {
    if (parent.has(edge.source) && parent.has(edge.target)) {
      union(edge.source, edge.target)
    }
  }

  // Count unique roots
  const roots = new Set<string>()
  for (const node of nodes) {
    roots.add(find(node.id))
  }

  return roots.size
}
