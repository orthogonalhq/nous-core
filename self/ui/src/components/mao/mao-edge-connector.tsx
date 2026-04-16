'use client';

import * as React from 'react';
import { AGENT_CLASS_COLORS, FALLBACK_CLASS_COLOR } from './mao-workflow-group-card';

/**
 * Edge animation state — stub for WR-095 integration.
 * Currently only 'idle' is visually consumed. The data source
 * (`mao:agent-edge-activity` event channel) is deferred to WR-095.
 */
export type EdgeAnimationState = 'idle' | 'active' | 'pulse';

export interface EdgeDef {
  parentId: string;
  childId: string;
  parentAgentClass?: string;
}

export interface MaoEdgeConnectorProps {
  /** Parent-child pairs to draw edges for */
  edges: EdgeDef[];
  /** Animation state — stub: always 'idle'. Data source deferred to WR-095. */
  animationState?: EdgeAnimationState;
  /** When true, edges are not rendered (D4 density) */
  hidden?: boolean;
}

interface ComputedEdge {
  key: string;
  path: string;
  strokeColor: string;
}

function computeEdgePath(
  parentRect: DOMRect,
  childRect: DOMRect,
  containerRect: DOMRect,
): string {
  const x1 = parentRect.left + parentRect.width / 2 - containerRect.left;
  const y1 = parentRect.bottom - containerRect.top;
  const x2 = childRect.left + childRect.width / 2 - containerRect.left;
  const y2 = childRect.top - containerRect.top;
  const yMid = (y1 + y2) / 2;

  return `M ${x1} ${y1} L ${x1} ${yMid} L ${x2} ${yMid} L ${x2} ${y2}`;
}

function getStrokeColor(parentAgentClass?: string): string {
  const color = AGENT_CLASS_COLORS[parentAgentClass ?? ''];
  return color ? color.strokeColor : FALLBACK_CLASS_COLOR.strokeColor;
}

export function MaoEdgeConnector({
  edges,
  animationState = 'idle',
  hidden = false,
}: MaoEdgeConnectorProps) {
  const [computedEdges, setComputedEdges] = React.useState<ComputedEdge[]>([]);
  const svgRef = React.useRef<SVGSVGElement>(null);

  React.useLayoutEffect(() => {
    function measure() {
      const svg = svgRef.current;
      if (!svg) return;
      const container = svg.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const result: ComputedEdge[] = [];

      for (const edge of edges) {
        const parentEl = container.querySelector(
          `[data-agent-id="${edge.parentId}"]`,
        );
        const childEl = container.querySelector(
          `[data-agent-id="${edge.childId}"]`,
        );
        if (!parentEl || !childEl) continue;

        const parentRect = parentEl.getBoundingClientRect();
        const childRect = childEl.getBoundingClientRect();

        // Skip edges where either element has zero-size rect
        if (
          parentRect.width === 0 ||
          parentRect.height === 0 ||
          childRect.width === 0 ||
          childRect.height === 0
        ) {
          continue;
        }

        result.push({
          key: `${edge.parentId}-${edge.childId}`,
          path: computeEdgePath(parentRect, childRect, containerRect),
          strokeColor: getStrokeColor(edge.parentAgentClass),
        });
      }

      setComputedEdges(result);
    }

    measure();

    // Re-measure on resize
    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [edges]);

  return (
    <svg
      ref={svgRef}
      data-testid="edge-connector-svg"
      data-animation-state={animationState}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        ...(hidden ? { display: 'none' } : {}),
      }}
      aria-hidden="true"
    >
      {computedEdges.map((edge) => (
        <path
          key={edge.key}
          d={edge.path}
          fill="none"
          stroke={edge.strokeColor}
          strokeWidth={1.5}
          opacity={0.6}
          data-testid="edge-path"
        />
      ))}
    </svg>
  );
}
