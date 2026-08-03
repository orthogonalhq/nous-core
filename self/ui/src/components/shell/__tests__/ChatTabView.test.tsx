// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ShellProvider } from '../ShellContext'
import { ChatTabView } from '../ChatTabView'

const chatPanelProps: unknown[] = []
const useChatApiMock = vi.fn()
const useListSessionsMock = vi.fn()

vi.mock('@nous/transport', () => ({
  trpc: {
    projects: {
      list: {
        useQuery: () => ({
          data: [{ id: 'project-1', name: 'Project One' }],
          isLoading: false,
        }),
      },
    },
  },
  useChatApi: (options: unknown) => useChatApiMock(options),
  useListSessions: (projectId: string) => useListSessionsMock(projectId),
}))

vi.mock('../../../panels/ChatPanel', () => ({
  ChatPanel: (props: unknown) => {
    chatPanelProps.push(props)
    return React.createElement('div', { 'data-testid': 'chat-panel' })
  },
}))

describe('ChatTabView', () => {
  beforeEach(() => {
    chatPanelProps.length = 0
    useChatApiMock.mockReset()
    useListSessionsMock.mockReset()
    useChatApiMock.mockReturnValue({ send: vi.fn(), getHistory: vi.fn() })
    useListSessionsMock.mockReturnValue({
      data: [
        {
          sessionId: '00000000-0000-0000-0000-000000000001',
          firstMessage: 'Existing chat',
          lastTimestamp: new Date().toISOString(),
        },
      ],
      isLoading: false,
    })
  })

  it('threads projectId and sessionId from chat tab sessions into ChatPanel', () => {
    const { getByText } = render(
      <ShellProvider activeProjectId="project-1">
        <ChatTabView {...({} as any)} />
      </ShellProvider>,
    )

    fireEvent.click(getByText('Existing chat'))

    expect(useChatApiMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      sessionId: '00000000-0000-0000-0000-000000000001',
    })
    expect(chatPanelProps[0]).toMatchObject({
      projectId: 'project-1',
      sessionId: '00000000-0000-0000-0000-000000000001',
      stage: 'full',
    })
  })
})
