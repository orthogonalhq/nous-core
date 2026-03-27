// @vitest-environment jsdom

/* @vitest-environment jsdom */

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useProject: vi.fn(),
  useSearchParams: vi.fn(),
  WorkflowBuilderPanel: vi.fn(),
}));

vi.mock('@/lib/project-context', () => ({
  useProject: mocks.useProject,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: mocks.useSearchParams,
}));

vi.mock('@nous/ui/panels', () => ({
  WorkflowBuilderPanel: (props: Record<string, unknown>) => {
    mocks.WorkflowBuilderPanel(props);
    return <div data-testid="workflow-builder-panel" />;
  },
}));

import ProjectsPage from '@/app/(shell)/projects/page';

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProject.mockReturnValue({
      projectId: '550e8400-e29b-41d4-a716-446655443001',
      setProjectId: vi.fn(),
    });
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn(() => null),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders WorkflowBuilderPanel from @nous/ui/panels', () => {
    render(<ProjectsPage />);

    expect(screen.getByTestId('workflow-builder-panel')).toBeTruthy();
    expect(mocks.WorkflowBuilderPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.any(String),
      }),
    );
  });

  it('shows project selection prompt when no project is selected', () => {
    mocks.useProject.mockReturnValue({
      projectId: null,
      setProjectId: vi.fn(),
    });

    render(<ProjectsPage />);

    expect(
      screen.getByText(
        'Select a project from the navigation panel to monitor and edit workflows.',
      ),
    ).toBeTruthy();
  });

  it('preserves MAO handoff context in the project surface', () => {
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn((key: string) => {
        const values: Record<string, string | null> = {
          source: 'mao',
          projectId: '550e8400-e29b-41d4-a716-446655443001',
          runId: '550e8400-e29b-41d4-a716-446655443004',
          nodeId: '550e8400-e29b-41d4-a716-446655443003',
          evidenceRef: 'evidence://workflow:blocked',
        };
        return values[key] ?? null;
      }),
    });

    render(<ProjectsPage />);

    expect(screen.getByText(/MAO handoff active/i)).toBeTruthy();
    expect(screen.getAllByText(/Return to MAO/i).length).toBeGreaterThan(0);
  });
});
