import { describe, it, expect, vi } from 'vitest'

vi.mock('@nous/ui/panels', () => ({
  PlaceholderPanel: () => null,
  NodeProjectionPanel: () => null,
  MAOPanel: () => null,
  CodexBarPanel: () => null,
  DashboardPanel: () => null,
  AgentPanel: () => null,
  WorkflowBuilderPanel: () => null,
  ChatPanel: () => null,
  PreferencesPanel: () => null,
}))

vi.mock('@nous/ui/components', () => ({
  ChatSurface: () => null,
}))

vi.mock('@nous/transport', () => ({
  useChatApi: () => ({ send: vi.fn(), getHistory: vi.fn().mockResolvedValue([]) }),
  usePreferencesApi: () => ({}),
}))

import { webPanelComponents } from '@/components/shell/web-panel-map'

describe('webPanelComponents', () => {
  it('has 9 panel entries', () => {
    expect(Object.keys(webPanelComponents).length).toBe(9)
  })

  it('each entry is a function (valid component)', () => {
    for (const [key, value] of Object.entries(webPanelComponents)) {
      expect(typeof value).toBe('function')
    }
  })

  it('all expected panel IDs present', () => {
    const ids = Object.keys(webPanelComponents)
    const expected = [
      'placeholder',
      'chat',
      'node-projection',
      'mao',
      'codexbar',
      'dashboard',
      'coding-agents',
      'preferences',
      'workflow-builder',
    ]
    for (const id of expected) {
      expect(ids).toContain(id)
    }
  })

  it('does not include Electron-only panels', () => {
    const ids = Object.keys(webPanelComponents)
    expect(ids).not.toContain('file-browser')
    expect(ids).not.toContain('app-installer')
    expect(ids).not.toContain('app-iframe')
  })
})
