// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProviderHealthWidget } from '../widgets/ProviderHealthWidget'
import type { ProviderHealthSnapshot } from '@nous/shared'
import type { IDockviewPanelProps } from 'dockview-react'

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      health: { providerHealth: { invalidate: vi.fn() } },
    }),
    health: {
      providerHealth: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
    },
  },
  useEventSubscription: vi.fn(),
}))

import { trpc } from '@nous/transport'

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProviderHealthWidget', () => {
  it('renders loading indicator during initial fetch', () => {
    vi.mocked(trpc.health.providerHealth.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    render(<ProviderHealthWidget {...dockviewProps} />)
    expect(screen.getByText('Loading provider health...')).toBeTruthy()
  })

  it('renders live provider entries when data is available', () => {
    vi.mocked(trpc.health.providerHealth.useQuery).mockReturnValue({
      data: mockSnapshot,
      isLoading: false,
      error: null,
    } as any)

    render(<ProviderHealthWidget {...dockviewProps} />)

    expect(screen.getByText('Ollama')).toBeTruthy()
    expect(screen.getByText('OpenAI')).toBeTruthy()
    expect(screen.getByText('Anthropic')).toBeTruthy()
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.getByText('Unknown')).toBeTruthy()
    expect(screen.getByText('Unreachable')).toBeTruthy()
    expect(screen.getByText('llama3.2:3b')).toBeTruthy()
    expect(screen.getByText(/Updated:/)).toBeTruthy()
  })

  it('renders error fallback when query has error', () => {
    vi.mocked(trpc.health.providerHealth.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Connection refused'),
    } as any)

    render(<ProviderHealthWidget {...dockviewProps} />)
    expect(screen.getByText(/Failed to load provider health: Connection refused/)).toBeTruthy()
  })
})
