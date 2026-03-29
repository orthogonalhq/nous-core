'use client';

import * as React from 'react';
import type { MaoAgentProjection, MaoDensityMode, MaoSystemSnapshot } from '@nous/shared';
import { MaoWorkflowGroupCard, resolveAgentLabel, AGENT_CLASS_COLORS, FALLBACK_CLASS_COLOR } from './mao-workflow-group-card';
import { MaoEdgeConnector, type EdgeDef } from './mao-edge-connector';

// ---------------------------------------------------------------------------
// Lease Tree Derivation
// ---------------------------------------------------------------------------

export interface LeaseTreeNode {
  agent: MaoAgentProjection;
  children: LeaseTreeNode[];
  depth: number;
}

/**
 * Build a lease tree from the flat agents[] using dispatching_task_agent_id chains.
 * Cycle detection via visited set to prevent infinite recursion.
 */
export function buildLeaseTree(
  agents: MaoAgentProjection[],
  leaseRoots: string[],
): LeaseTreeNode[] {
  const agentMap = new Map(agents.map((a) => [a.agent_id, a]));
  const childrenMap = new Map<string | null, MaoAgentProjection[]>();

  for (const agent of agents) {
    const parentId = agent.dispatching_task_agent_id;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(agent);
  }

  const visited = new Set<string>();

  function buildNode(agent: MaoAgentProjection, depth: number): LeaseTreeNode {
    if (visited.has(agent.agent_id)) {
      console.warn(
        `[MaoLeaseTree] Cycle detected at agent ${agent.agent_id}. Treating as leaf.`,
      );
      return { agent, children: [], depth };
    }
    visited.add(agent.agent_id);

    const children = (childrenMap.get(agent.agent_id) ?? []).map((child) =>
      buildNode(child, depth + 1),
    );
    return { agent, children, depth };
  }

  return leaseRoots
    .map((id) => agentMap.get(id))
    .filter((a): a is MaoAgentProjection => a != null)
    .map((agent) => buildNode(agent, 0));
}

// ---------------------------------------------------------------------------
// Depth-row flattening
// ---------------------------------------------------------------------------

interface DepthRow {
  depth: number;
  /** For depth 0: individual root tiles. For depth 1+: groups keyed by parent. */
  groups: Array<{
    parentId: string | null;
    orchestrator: MaoAgentProjection;
    workers: MaoAgentProjection[];
  }>;
  /** Root tiles (depth 0 only) */
  rootTiles: MaoAgentProjection[];
}

function flattenToDepthRows(roots: LeaseTreeNode[]): DepthRow[] {
  const rowMap = new Map<number, DepthRow>();

  function ensureRow(depth: number): DepthRow {
    if (!rowMap.has(depth)) {
      rowMap.set(depth, { depth, groups: [], rootTiles: [] });
    }
    return rowMap.get(depth)!;
  }

  function walk(node: LeaseTreeNode, isRoot: boolean) {
    if (isRoot) {
      ensureRow(0).rootTiles.push(node.agent);
    }

    if (node.children.length > 0) {
      // The current node is a parent; its direct children form a group at depth + 1
      const childDepth = node.depth + 1;
      const row = ensureRow(childDepth);

      // Separate direct children that are orchestrators (have their own children)
      // vs workers (leaf nodes). The node itself is the orchestrator for this group.
      const workers = node.children.filter((c) => c.children.length === 0);
      const subOrchestrators = node.children.filter((c) => c.children.length > 0);

      // Workers group under the current node
      if (workers.length > 0 || subOrchestrators.length > 0) {
        row.groups.push({
          parentId: node.agent.agent_id,
          orchestrator: node.agent,
          workers: [
            ...subOrchestrators.map((s) => s.agent),
            ...workers.map((w) => w.agent),
          ],
        });
      }

      // Sub-orchestrators recurse
      for (const child of subOrchestrators) {
        walk(child, false);
      }
    }
  }

  for (const root of roots) {
    walk(root, true);
  }

  return Array.from(rowMap.values()).sort((a, b) => a.depth - b.depth);
}

// ---------------------------------------------------------------------------
// Collect edges for the connector
// ---------------------------------------------------------------------------

function collectEdges(roots: LeaseTreeNode[]): EdgeDef[] {
  const edges: EdgeDef[] = [];

  function walk(node: LeaseTreeNode) {
    for (const child of node.children) {
      edges.push({
        parentId: node.agent.agent_id,
        childId: child.agent.agent_id,
        parentAgentClass: node.agent.agent_class,
      });
      walk(child);
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return edges;
}

// ---------------------------------------------------------------------------
// Tile size helpers
// ---------------------------------------------------------------------------

function rootTileSizeClasses(densityMode: MaoDensityMode): string {
  switch (densityMode) {
    case 'D0':
    case 'D1':
      return 'min-w-64 p-4';
    case 'D2':
      return 'min-w-48 p-3';
    case 'D3':
      return 'min-w-16 p-1.5';
    case 'D4':
      return 'w-6 h-6';
    default:
      return 'min-w-48 p-3';
  }
}

function stateColorDot(state: string): string {
  switch (state) {
    case 'running':
    case 'resuming':
      return 'bg-emerald-500';
    case 'blocked':
    case 'waiting_pfc':
      return 'bg-amber-500';
    case 'failed':
      return 'bg-red-500';
    case 'completed':
      return 'bg-slate-400';
    default:
      return 'bg-slate-400';
  }
}

function getClassFill(agent: MaoAgentProjection): string {
  return (AGENT_CLASS_COLORS[agent.agent_class ?? ''] ?? FALLBACK_CLASS_COLOR).fill;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MaoLeaseTreeProps {
  snapshot: MaoSystemSnapshot;
  densityMode: MaoDensityMode;
  selectedAgentId: string | null;
  onSelectAgent: (agent: MaoAgentProjection) => void;
}

export function MaoLeaseTree({
  snapshot,
  densityMode,
  selectedAgentId,
  onSelectAgent,
}: MaoLeaseTreeProps) {
  const tree = React.useMemo(
    () => buildLeaseTree(snapshot.agents, snapshot.leaseRoots),
    [snapshot.agents, snapshot.leaseRoots],
  );

  const depthRows = React.useMemo(() => flattenToDepthRows(tree), [tree]);
  const edges = React.useMemo(() => collectEdges(tree), [tree]);

  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  if (snapshot.agents.length === 0) {
    return (
      <div data-testid="lease-tree-empty" className="flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          No agents are currently active across the system.
        </p>
      </div>
    );
  }

  // At D1, collapse deep subtrees (only show depth 0 and depth 1)
  const maxDepth = densityMode === 'D1' ? 1 : Infinity;

  return (
    <div className="relative" data-testid="lease-tree">
      <div className="flex flex-col gap-6">
        {depthRows
          .filter((row) => row.depth <= maxDepth)
          .map((row) => (
            <div key={`depth-${row.depth}`}>
              {row.depth === 0 ? (
                <div
                  className="flex flex-wrap gap-4"
                  data-testid="lease-root-row"
                >
                  {row.rootTiles.map((agent) => {
                    const isHovered = hoveredId === agent.agent_id;
                    const effectiveDensity =
                      (densityMode === 'D3' || densityMode === 'D4') && isHovered
                        ? densityMode === 'D4'
                          ? 'D3'
                          : 'D2'
                        : densityMode;

                    if (effectiveDensity === 'D4') {
                      return (
                        <button
                          key={agent.agent_id}
                          type="button"
                          data-agent-id={agent.agent_id}
                          onClick={() => onSelectAgent(agent)}
                          className={`w-6 h-6 rounded ${stateColorDot(agent.state)} ${
                            selectedAgentId === agent.agent_id
                              ? 'ring-2 ring-primary'
                              : ''
                          } ${getClassFill(agent)}`}
                          aria-label={resolveAgentLabel(agent)}
                          onMouseEnter={() => setHoveredId(agent.agent_id)}
                          onMouseLeave={() => setHoveredId(null)}
                        />
                      );
                    }

                    if (effectiveDensity === 'D3') {
                      return (
                        <button
                          key={agent.agent_id}
                          type="button"
                          data-agent-id={agent.agent_id}
                          onClick={() => onSelectAgent(agent)}
                          className={`flex items-center gap-1 rounded border px-1.5 py-1 text-xs transition-colors hover:bg-muted/30 ${
                            selectedAgentId === agent.agent_id
                              ? 'border-primary bg-primary/10'
                              : getClassFill(agent)
                          }`}
                          aria-label={resolveAgentLabel(agent)}
                          onMouseEnter={() => setHoveredId(agent.agent_id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${stateColorDot(agent.state)}`}
                          />
                          <span className="truncate max-w-24">
                            {resolveAgentLabel(agent)}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <button
                        key={agent.agent_id}
                        type="button"
                        data-agent-id={agent.agent_id}
                        onClick={() => onSelectAgent(agent)}
                        className={`rounded-lg border text-left transition-colors hover:bg-muted/20 ${rootTileSizeClasses(effectiveDensity)} ${
                          selectedAgentId === agent.agent_id
                            ? 'border-primary bg-primary/10'
                            : `border-border bg-background`
                        }`}
                        aria-label={resolveAgentLabel(agent)}
                        onMouseEnter={() => setHoveredId(agent.agent_id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {resolveAgentLabel(agent)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {agent.state}
                            </div>
                          </div>
                          <span
                            className={`inline-block w-2.5 h-2.5 rounded-full mt-1 ${stateColorDot(agent.state)}`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {row.groups.map((group) => (
                    <MaoWorkflowGroupCard
                      key={group.parentId ?? 'orphan'}
                      orchestrator={group.orchestrator}
                      workers={group.workers}
                      densityMode={densityMode}
                      selectedAgentId={selectedAgentId}
                      onSelectAgent={onSelectAgent}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>

      <MaoEdgeConnector edges={edges} hidden={densityMode === 'D4'} />
    </div>
  );
}
