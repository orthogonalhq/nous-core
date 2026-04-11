import { describe, expect, it } from 'vitest'
import {
  PAGE_IDS,
} from '../types'
import type {
  SettingsCategory,
  SettingsPage,
  SettingsPageProps,
  SettingsNavItem,
  SettingsNavProps,
  SettingsShellProps,
  AppPanelEntry,
  PreferencesApi,
  AvailableModel,
  RoleAssignmentDisplayEntry,
  ShellMode,
  Provider,
} from '../types'
import type { ModelRole } from '@nous/shared'
import { ModelRoleSchema, MODEL_ROLE_LABELS, MODEL_ROLE_HINTS } from '@nous/shared'

describe('settings types contract', () => {
  it('MODEL_ROLES from @nous/shared has 4 entries', () => {
    expect(ModelRoleSchema.options).toHaveLength(4)
  })

  it('MODEL_ROLES from @nous/shared contains all expected role strings', () => {
    expect([...ModelRoleSchema.options]).toEqual([
      'cortex-chat',
      'cortex-system',
      'orchestrators',
      'workers',
    ])
  })

  it('MODEL_ROLE_LABELS has an entry for each role', () => {
    for (const role of ModelRoleSchema.options) {
      expect(MODEL_ROLE_LABELS[role]).toBeDefined()
      expect(typeof MODEL_ROLE_LABELS[role]).toBe('string')
    }
  })

  it('MODEL_ROLE_HINTS has an entry for each role', () => {
    for (const role of ModelRoleSchema.options) {
      expect(MODEL_ROLE_HINTS[role]).toBeDefined()
      expect(typeof MODEL_ROLE_HINTS[role]).toBe('string')
    }
  })

  it('PAGE_IDS contains expected page identifiers', () => {
    expect(PAGE_IDS.SHELL_MODE).toBe('shell-mode')
    expect(PAGE_IDS.ABOUT).toBe('about')
    expect(PAGE_IDS.API_KEYS).toBe('api-keys')
    expect(PAGE_IDS.MODEL_CONFIG).toBe('model-config')
    expect(PAGE_IDS.SYSTEM_STATUS).toBe('system-status')
    expect(PAGE_IDS.SETUP_WIZARD).toBe('setup-wizard')
    expect(PAGE_IDS.LOCAL_MODELS).toBe('local-models')
  })

  it('re-exported types are importable (compile-time verification)', () => {
    // These assertions verify that the re-exported types resolve at import time.
    // If any re-export path is broken, TypeScript compilation will fail before
    // this test runs. The runtime assertions below confirm the type names are
    // usable in value positions (via type narrowing / structural checks).

    const shellMode: ShellMode = 'simple'
    expect(shellMode).toBe('simple')

    const provider: Provider = 'anthropic'
    expect(provider).toBe('anthropic')

    const role: ModelRole = 'cortex-chat'
    expect(role).toBe('cortex-chat')
  })

  it('SettingsCategory has expected structural shape', () => {
    const category: SettingsCategory = {
      id: 'test',
      label: 'Test',
      icon: null,
      children: [{ id: 'page-1', label: 'Page 1' }],
      defaultExpanded: true,
    }

    expect(category.id).toBe('test')
    expect(category.label).toBe('Test')
    expect(category.icon).toBeNull()
    expect(category.children).toHaveLength(1)
    expect(category.defaultExpanded).toBe(true)
  })

  it('SettingsPage has expected structural shape', () => {
    const page: SettingsPage = {
      id: 'test-page',
      label: 'Test Page',
    }

    expect(page.id).toBe('test-page')
    expect(page.label).toBe('Test Page')
    expect(page.component).toBeUndefined()
  })

  it('SettingsShellProps has expected structural shape', () => {
    const props: SettingsShellProps = {}

    expect(props.api).toBeUndefined()
    expect(props.appPanels).toBeUndefined()
    expect(props.defaultPageId).toBeUndefined()
  })

  it('AppPanelEntry has expected structural shape', () => {
    const entry: AppPanelEntry = {
      id: 'app-1',
      title: 'App One',
    }

    expect(entry.id).toBe('app-1')
    expect(entry.title).toBe('App One')
  })

  // Compile-time-only type assertions — these verify types exist and are usable
  // without needing runtime values. If any fails, TypeScript will error.
  it('SettingsNavItem has structural members (compile-time)', () => {
    const item: SettingsNavItem = {
      id: 'nav-1',
      label: 'Nav Item',
      icon: null,
      isActive: true,
      depth: 0,
    }

    expect(item.isActive).toBe(true)
    expect(item.depth).toBe(0)
  })

  it('SettingsNavProps has structural members (compile-time)', () => {
    const props: SettingsNavProps = {
      categories: [],
      activePageId: 'test',
      onPageSelect: () => undefined,
    }

    expect(props.categories).toEqual([])
    expect(props.activePageId).toBe('test')
    expect(typeof props.onPageSelect).toBe('function')
  })
})
