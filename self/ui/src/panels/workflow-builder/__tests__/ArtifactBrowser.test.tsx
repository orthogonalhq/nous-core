// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { ArtifactBrowser } from '../monitoring/ArtifactBrowser'
import type { ArtifactRef } from '../../../types/workflow-builder'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_ARTIFACTS: ArtifactRef[] = [
  { id: 'a1', type: 'packet', label: 'Dispatch to orchestrator', nodeId: 'n1', artifactType: 'dispatch' },
  { id: 'a2', type: 'cycle', label: 'Review cycle 1', nodeId: 'n1', artifactType: 'revision' },
  { id: 'a3', type: 'alert', label: 'Severity escalation', nodeId: 'n1', artifactType: 'escalation' },
  { id: 'a4', type: 'result', label: 'Final output', nodeId: 'n1', artifactType: 'output' },
  { id: 'a5', type: 'misc', label: 'Debug log', nodeId: 'n1', artifactType: 'other' },
]

function renderArtifactBrowser(props?: Partial<React.ComponentProps<typeof ArtifactBrowser>>) {
  const containerRef = { current: document.createElement('div') }
  const defaultProps = {
    nodeId: 'n1',
    nodeLabel: 'Test Node',
    artifacts: SAMPLE_ARTIFACTS,
    containerRef,
    ...props,
  }

  return render(<ArtifactBrowser {...defaultProps} />)
}

// ─── Tier 1 — Contract ────────────────────────────────────────────────────────

describe('ArtifactBrowser — Contract', () => {
  it('renders inside a FloatingPanel with "Artifacts" title', () => {
    renderArtifactBrowser()
    expect(screen.getByText('Artifacts')).toBeTruthy()
  })

  it('displays the node label as subtitle', () => {
    renderArtifactBrowser()
    expect(screen.getByText('Test Node')).toBeTruthy()
  })

  it('renders a row for each artifact', () => {
    renderArtifactBrowser()
    const list = screen.getByTestId('artifact-list')
    expect(list).toBeTruthy()
    for (const artifact of SAMPLE_ARTIFACTS) {
      expect(screen.getByTestId(`artifact-row-${artifact.id}`)).toBeTruthy()
    }
  })
})

// ─── Tier 2 — Behavior ───────────────────────────────────────────────────────

describe('ArtifactBrowser — Behavior', () => {
  it('displays artifact labels', () => {
    renderArtifactBrowser()
    expect(screen.getByText('Dispatch to orchestrator')).toBeTruthy()
    expect(screen.getByText('Review cycle 1')).toBeTruthy()
    expect(screen.getByText('Final output')).toBeTruthy()
  })

  it('shows artifact type badges with correct data-artifact-type attribute', () => {
    renderArtifactBrowser()
    expect(screen.getByTestId('artifact-type-a1').getAttribute('data-artifact-type')).toBe('dispatch')
    expect(screen.getByTestId('artifact-type-a2').getAttribute('data-artifact-type')).toBe('revision')
    expect(screen.getByTestId('artifact-type-a3').getAttribute('data-artifact-type')).toBe('escalation')
    expect(screen.getByTestId('artifact-type-a4').getAttribute('data-artifact-type')).toBe('output')
    expect(screen.getByTestId('artifact-type-a5').getAttribute('data-artifact-type')).toBe('other')
  })

  it('displays artifact type labels in uppercase', () => {
    renderArtifactBrowser()
    expect(screen.getByTestId('artifact-type-a1').textContent).toBe('DISPATCH')
    expect(screen.getByTestId('artifact-type-a4').textContent).toBe('OUTPUT')
  })

  it('displays artifact IDs', () => {
    renderArtifactBrowser()
    // Each row should show the artifact ID somewhere
    for (const artifact of SAMPLE_ARTIFACTS) {
      const row = screen.getByTestId(`artifact-row-${artifact.id}`)
      expect(row.textContent).toContain(artifact.id)
    }
  })

  it('rows are non-interactive (no click handlers)', () => {
    renderArtifactBrowser()
    const row = screen.getByTestId('artifact-row-a1')
    expect(row.style.cursor).toBe('default')
  })
})

// ─── Tier 3 — Edge cases ──────────────────────────────────────────────────────

describe('ArtifactBrowser — Edge cases', () => {
  it('shows empty state when artifacts array is empty', () => {
    renderArtifactBrowser({ artifacts: [] })
    const emptyState = screen.getByTestId('artifact-browser-empty')
    expect(emptyState).toBeTruthy()
    expect(emptyState.textContent).toContain('No artifacts')
  })

  it('does not render artifact-list when empty', () => {
    renderArtifactBrowser({ artifacts: [] })
    expect(screen.queryByTestId('artifact-list')).toBeNull()
  })
})
