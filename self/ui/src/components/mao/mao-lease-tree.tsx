'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';
import type { MaoAgentProjection, MaoDensityMode, MaoSystemSnapshot } from '@nous/shared';
import { MaoWorkflowGroupCard, resolveAgentLabel, AGENT_CLASS_COLORS, FALLBACK_CLASS_COLOR } from './mao-workflow-group-card';
import { MaoEdgeConnector, type EdgeDef } from './mao-edge-connector';
import { getStateVisuals } from './mao-state-utils';

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

function rootTileSizeStyle(densityMode: MaoDensityMode): CSSProperties {
  switch (densityMode) {
    case 'D0':
    case 'D1':
      return { minWidth: '16rem', padding: 'var(--nous-space-2xl)' };
    case 'D2':
      return { minWidth: '12rem', padding: 'var(--nous-space-xl)' };
    case 'D3':
      return { minWidth: '4rem', padding: '6px' };
    case 'D4':
      return { width: '1.5rem', height: '1.5rem' };
    default:
      return { minWidth: '12rem', padding: 'var(--nous-space-xl)' };
  }
}

function getClassFillStyle(agent: MaoAgentProjection): CSSProperties {
  return (AGENT_CLASS_COLORS[agent.agent_class ?? ''] ?? FALLBACK_CLASS_COLOR).fillStyle;
}

/** Small SVG exclamation icon for urgent indicators at D3 */
function UrgentIcon() {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: '#ef4444', flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="4" fill="currentColor" />
      <text x="4" y="6" textAnchor="middle" fontSize="6" fill="white" fontWeight="bold">!</text>
    </svg>
  );
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
      <div data-testid="lease-tree-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--nous-space-4xl)' }}>
        <p style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
          No agents are currently active across the system.
        </p>
      </div>
    );
  }

  // At D1, collapse deep subtrees (only show depth 0 and depth 1)
  const maxDepth = densityMode === 'D1' ? 1 : Infinity;

  return (
    <div style={{ position: 'relative' }} data-testid="lease-tree">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-3xl)' }}>
        {depthRows
          .filter((row) => row.depth <= maxDepth)
          .map((row) => (
            <div key={`depth-${row.depth}`}>
              {row.depth === 0 ? (
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-2xl)' }}
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
                    const visuals = getStateVisuals(agent.state);
                    const isUrgent = agent.urgency_level === 'urgent';
                    const isSelected = selectedAgentId === agent.agent_id;

                    if (effectiveDensity === 'D4') {
                      return (
                        <button
                          key={agent.agent_id}
                          type="button"
                          data-agent-id={agent.agent_id}
                          onClick={() => onSelectAgent(agent)}
                          className={visuals.pulse || undefined}
                          style={{
                            width: '1.5rem',
                            height: '1.5rem',
                            borderRadius: 'var(--nous-radius-xs)',
                            ...visuals.dotStyle,
                            ...getClassFillStyle(agent),
                            ...(isSelected ? { boxShadow: '0 0 0 2px var(--nous-accent)' } : {}),
                            ...(isUrgent ? { boxShadow: '0 0 0 2px #ef4444' } : {}),
                          }}
                          aria-label={resolveAgentLabel(agent)}
                          onMouseEnter={() => setHoveredId(agent.agent_id)}
                          onMouseLeave={() => setHoveredId(null)}
                          data-testid="urgent-indicator-wrapper"
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
                          className={visuals.pulse || undefined}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--nous-space-2xs)',
                            borderRadius: 'var(--nous-radius-xs)',
                            border: '1px solid',
                            paddingInline: '6px',
                            paddingBlock: 'var(--nous-space-2xs)',
                            fontSize: 'var(--nous-font-size-xs)',
                            transition: 'background-color 0.15s',
                            ...(isSelected
                              ? { borderColor: 'var(--nous-accent)', backgroundColor: 'rgba(0,122,204,0.1)' }
                              : getClassFillStyle(agent)),
                            ...(isUrgent ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#ef4444' } : {}),
                          }}
                          aria-label={resolveAgentLabel(agent)}
                          onMouseEnter={() => setHoveredId(agent.agent_id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '9999px', ...visuals.dotStyle }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '6rem' }}>
                            {resolveAgentLabel(agent)}
                          </span>
                          {isUrgent && (
                            <span data-testid="urgent-indicator"><UrgentIcon /></span>
                          )}
                        </button>
                      );
                    }

                    // D0-D2: full root tile with agent class badge
                    return (
                      <button
                        key={agent.agent_id}
                        type="button"
                        data-agent-id={agent.agent_id}
                        onClick={() => onSelectAgent(agent)}
                        className={visuals.pulse || undefined}
                        style={{
                          borderRadius: 'var(--nous-radius-md)',
                          border: '1px solid',
                          textAlign: 'left',
                          transition: 'background-color 0.15s',
                          ...rootTileSizeStyle(effectiveDensity),
                          ...(isSelected
                            ? { borderColor: 'var(--nous-accent)', backgroundColor: 'rgba(0,122,204,0.1)' }
                            : { borderColor: 'var(--nous-border-subtle)', backgroundColor: 'var(--nous-bg)' }),
                        }}
                        aria-label={resolveAgentLabel(agent)}
                        onMouseEnter={() => setHoveredId(agent.agent_id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--nous-font-size-sm)', fontWeight: 500 }}>
                              {resolveAgentLabel(agent)}
                              {agent.agent_class && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    borderRadius: 'var(--nous-radius-xs)',
                                    paddingInline: 'var(--nous-space-2xs)',
                                    paddingBlock: '2px',
                                    fontSize: '10px',
                                    fontWeight: 500,
                                    lineHeight: 1,
                                    ...(AGENT_CLASS_COLORS[agent.agent_class] ?? FALLBACK_CLASS_COLOR).fillStyle,
                                  }}
                                  data-testid="agent-class-badge"
                                >
                                  {(AGENT_CLASS_COLORS[agent.agent_class] ?? FALLBACK_CLASS_COLOR).label}
                                </span>
                              )}
                            </div>
                            <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                              {agent.state}
                            </div>
                          </div>
                          <span style={{ display: 'inline-block', width: '0.625rem', height: '0.625rem', borderRadius: '9999px', marginTop: 'var(--nous-space-2xs)', ...visuals.dotStyle }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-2xl)' }}>
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
