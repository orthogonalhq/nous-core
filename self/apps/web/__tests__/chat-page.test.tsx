// @vitest-environment jsdom

/* @vitest-environment jsdom */

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getHistoryUseQuery: vi.fn(),
  listProjectQueueUseQuery: vi.fn(),
  sendMessageUseMutation: vi.fn(),
  acknowledgeUseMutation: vi.fn(),
  useUtils: vi.fn(),
  useProject: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      getHistory: { useQuery: mocks.getHistoryUseQuery },
      sendMessage: { useMutation: mocks.sendMessageUseMutation },
    },
    escalations: {
      listProjectQueue: { useQuery: mocks.listProjectQueueUseQuery },
      acknowledge: { useMutation: mocks.acknowledgeUseMutation },
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

import ChatPage from '@/app/(shell)/chat/page';

describe('ChatPage', () => {
  const sendMessageMutate = vi.fn();
  const acknowledgeMutate = vi.fn();
  const invalidateHistory = vi.fn();
  const invalidateQueue = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProject.mockReturnValue({
      projectId: '550e8400-e29b-41d4-a716-446655444001',
      setProjectId: vi.fn(),
    });
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn(() => null),
    });
    mocks.getHistoryUseQuery.mockReturnValue({
      data: {
        entries: [
          {
            role: 'assistant',
            content: 'Ready to help.',
            timestamp: '2026-03-09T19:00:00.000Z',
          },
        ],
        summary: undefined,
        tokenCount: 10,
      },
    });
    mocks.listProjectQueueUseQuery.mockReturnValue({
      data: {
        projectId: '550e8400-e29b-41d4-a716-446655444001',
        items: [
          {
            escalationId: '550e8400-e29b-41d4-a716-446655444002',
            projectId: '550e8400-e29b-41d4-a716-446655444001',
            source: 'workflow',
            severity: 'high',
            title: 'Workflow blocked on review',
            message: 'Review and resume is required.',
            status: 'visible',
            routeTargets: ['projects', 'chat'],
            evidenceRefs: ['evidence:workflow:blocked'],
            acknowledgements: [],
            createdAt: '2026-03-09T19:00:00.000Z',
            updatedAt: '2026-03-09T19:00:00.000Z',
          },
        ],
        openCount: 1,
        acknowledgedCount: 0,
        urgentCount: 1,
      },
    });
    mocks.sendMessageUseMutation.mockReturnValue({
      mutate: sendMessageMutate,
      isPending: false,
    });
    mocks.acknowledgeUseMutation.mockReturnValue({
      mutate: acknowledgeMutate,
      isPending: false,
    });
    mocks.useUtils.mockReturnValue({
      chat: {
        getHistory: {
          invalidate: invalidateHistory,
        },
      },
      escalations: {
        listProjectQueue: {
          invalidate: invalidateQueue,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders canonical chat history', () => {
    render(<ChatPage />);

    expect(screen.getByText('Ready to help.')).toBeTruthy();
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
