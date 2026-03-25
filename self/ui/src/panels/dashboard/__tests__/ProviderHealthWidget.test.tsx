// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProviderHealthWidget } from '../widgets/ProviderHealthWidget'
import { HealthQueryProvider } from '../hooks/HealthQueryProvider'
import type { HealthFetchers } from '../hooks/HealthQueryProvider'
import type { ProviderHealthSnapshot } from '@nous/shared'
import type { IDockviewPanelProps } from 'dockview-react'

vi.mock('../../../../hooks/useEventSubscription', () => ({
  useEventSubscription: vi.fn(),
}))

const mockSnapshot: ProviderHealthSnapshot = {
  providers: [
    {
      providerId: '00000000-0000-0000-0000-000000000001',
      name: 'Ollama',
      type: 'local',
      isLocal: true,
      endpoint: 'http://localhost:11434',
      status: 'available',
      modelId: 'llama3.2:3b',
    },
    {
      providerId: '00000000-0000-0000-0000-000000000002',
      name: 'OpenAI',
      type: 'cloud',
      isLocal: false,
      status: 'unknown',
    },
    {
      providerId: '00000000-0000-0000-0000-000000000003',
      name: 'Anthropic',
      type: 'cloud',
      isLocal: false,
      status: 'unreachable',
    },
  ],
  collectedAt: '2026-03-25T10:00:00.000Z',
}

const dockviewProps = {} as IDockviewPanelProps

function renderWithProvider(fetchers: Partial<HealthFetchers>) {
  const defaultFetchers: HealthFetchers = {
    fetchSystemStatus: vi.fn(),
    fetchProviderHealth: vi.fn().mockResolvedValue(mockSnapshot),
    fetchAgentStatus: vi.fn(),
    ...fetchers,
  }

  return render(
    <HealthQueryProvider fetchers={defaultFetchers}>
      <ProviderHealthWidget {...dockviewProps} />
    </HealthQueryProvider>,
  )
}

describe('ProviderHealthWidget', () => {
  it('renders loading indicator during initial fetch', () => {
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}))
    renderWithProvider({ fetchProviderHealth: fetcher })

    expect(screen.getByText('Loading provider health...')).toBeTruthy()
  })

  it('renders live provider entries when data is available', async () => {
    renderWithProvider({})

    expect(await screen.findByText('Ollama')).toBeTruthy()
    expect(screen.getByText('OpenAI')).toBeTruthy()
    expect(screen.getByText('Anthropic')).toBeTruthy()
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.getByText('Unknown')).toBeTruthy()
    expect(screen.getByText('Unreachable')).toBeTruthy()
    expect(screen.getByText('llama3.2:3b')).toBeTruthy()
    expect(screen.getByText(/Updated:/)).toBeTruthy()
  })

  it('renders error fallback when fetch fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Connection refused'))
    renderWithProvider({ fetchProviderHealth: fetcher })

    expect(
      await screen.findByText(/Failed to load provider health: Connection refused/),
    ).toBeTruthy()
  })
})
