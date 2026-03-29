// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

import { MaoEdgeConnector, type EdgeDef } from '../mao-edge-connector';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('MaoEdgeConnector', () => {
  it('renders SVG element with data-testid', () => {
    render(
      <div>
        <MaoEdgeConnector edges={[]} />
      </div>,
    );

    const svg = screen.getByTestId('edge-connector-svg');
    expect(svg).toBeTruthy();
    expect(svg.tagName).toBe('svg');
  });

  it('defaults animationState to idle', () => {
    render(
      <div>
        <MaoEdgeConnector edges={[]} />
      </div>,
    );

    const svg = screen.getByTestId('edge-connector-svg');
    expect(svg.getAttribute('data-animation-state')).toBe('idle');
  });

  it('accepts animationState prop', () => {
    render(
      <div>
        <MaoEdgeConnector edges={[]} animationState="active" />
      </div>,
    );

    const svg = screen.getByTestId('edge-connector-svg');
    expect(svg.getAttribute('data-animation-state')).toBe('active');
  });

  it('hides SVG when hidden prop is true', () => {
    render(
      <div>
        <MaoEdgeConnector edges={[]} hidden />
      </div>,
    );

    const svg = screen.getByTestId('edge-connector-svg');
    expect(svg.style.display).toBe('none');
  });

  it('shows SVG when hidden prop is false', () => {
    render(
      <div>
        <MaoEdgeConnector edges={[]} hidden={false} />
      </div>,
    );

    const svg = screen.getByTestId('edge-connector-svg');
    expect(svg.style.display).not.toBe('none');
  });

  it('renders with edges prop (paths computed via layout effect in real DOM)', () => {
    const edges: EdgeDef[] = [
      { parentId: 'a', childId: 'b', parentAgentClass: 'Worker' },
      { parentId: 'a', childId: 'c', parentAgentClass: undefined },
    ];

    render(
      <div>
        <div data-agent-id="a" style={{ width: 100, height: 50 }}>Parent</div>
        <div data-agent-id="b" style={{ width: 100, height: 50 }}>Child 1</div>
        <div data-agent-id="c" style={{ width: 100, height: 50 }}>Child 2</div>
        <MaoEdgeConnector edges={edges} />
      </div>,
    );

    // SVG should render even if layout doesn't compute real rects in jsdom
    const svg = screen.getByTestId('edge-connector-svg');
    expect(svg).toBeTruthy();
  });

  it('has pointer-events none on the SVG', () => {
    render(
      <div>
        <MaoEdgeConnector edges={[]} />
      </div>,
    );

    const svg = screen.getByTestId('edge-connector-svg');
    // SVG className is an SVGAnimatedString in jsdom; use getAttribute
    expect(svg.getAttribute('class')).toContain('pointer-events-none');
  });

  it('has aria-hidden attribute', () => {
    render(
      <div>
        <MaoEdgeConnector edges={[]} />
      </div>,
    );

    const svg = screen.getByTestId('edge-connector-svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
