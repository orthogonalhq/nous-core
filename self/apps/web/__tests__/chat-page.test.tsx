// @vitest-environment jsdom

/* @vitest-environment jsdom */

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMessageUseMutation: vi.fn(),
  useUtils: vi.fn(),
  useProject: vi.fn(),
  useSearchParams: vi.fn(),
  ChatPanel: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      sendMessage: { useMutation: mocks.sendMessageUseMutation },
    },
    useUtils: mocks.useUtils,
  },
}));

vi.mock('@/lib/project-context', () => ({
  useProject: mocks.useProject,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: mocks.useSearchParams,
}));

vi.mock('@nous/ui/panels', () => ({
  ChatPanel: (props: Record<string, unknown>) => {
    mocks.ChatPanel(props);
    return <div data-testid="chat-panel" />;
  },
}));

import ChatPage from '@/app/(shell)/chat/page';

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProject.mockReturnValue({
      projectId: '550e8400-e29b-41d4-a716-446655444001',
      setProjectId: vi.fn(),
    });
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn(() => null),
    });
    mocks.sendMessageUseMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mocks.useUtils.mockReturnValue({
      chat: {
        getHistory: {
          invalidate: vi.fn(),
          fetch: vi.fn().mockResolvedValue({ entries: [], summary: undefined, tokenCount: 0 }),
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders ChatPanel from @nous/ui/panels with chatApi prop', () => {
    render(<ChatPage />);

    expect(screen.getByTestId('chat-panel')).toBeTruthy();
    expect(mocks.ChatPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        chatApi: expect.objectContaining({
          send: expect.any(Function),
          getHistory: expect.any(Function),
        }),
      }),
    );
  });

  it('renders MAO-origin reasoning continuity in chat', () => {
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn((key: string) => {
        const values: Record<string, string | null> = {
          source: 'mao',
          projectId: '550e8400-e29b-41d4-a716-446655444001',
          runId: '550e8400-e29b-41d4-a716-446655444010',
          nodeId: '550e8400-e29b-41d4-a716-446655444011',
          evidenceRef: 'evidence://workflow:blocked',
          reasoningRef: 'evidence://reasoning-preview',
        };
        return values[key] ?? null;
      }),
    });

    render(<ChatPage />);

    expect(screen.getByText(/MAO reasoning handoff active/i)).toBeTruthy();
    expect(screen.getAllByText(/Return to MAO/i).length).toBeGreaterThan(0);
  });
});
