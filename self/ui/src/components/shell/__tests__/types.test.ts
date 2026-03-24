import type { ConversationContext, ObserveRoute, ShellMode } from '../types'
import {
  ColumnWidthsSchema,
  ContentRouteSchema,
  FlyoutItemSchema,
  ProjectItemSchema,
  RailItemSchema,
  RailSectionSchema,
  ShellBreakpointSchema,
  ShellModeSchema,
  ObserveRouteSchema,
  ObservePanelPropsSchema,
  ChatSurfacePropsSchema,
  MAOSurfacePropsSchema,
  HomeScreenPropsSchema,
  defaultConversationContext,
  CatalogItemSchema,
  CatalogFilterGroupSchema,
  CatalogSortOptionSchema,
  CatalogViewPropsSchema,
  CommandItemSchema,
  CommandGroupSchema,
  CommandPalettePropsSchema,
} from '../types'

describe('shell type schemas', () => {
  it('parses valid shell mode values and exposes the expected literal union', () => {
    const simpleMode: ShellMode = 'simple'
    const developerMode: ShellMode = 'developer'

    expect(simpleMode).toBe('simple')
    expect(developerMode).toBe('developer')
    expect(ShellModeSchema.options).toEqual(['simple', 'developer'])
  })

  it('parses a valid rail item and rejects an invalid one', () => {
    expect(
      RailItemSchema.safeParse({
        id: 'home',
        label: 'Home',
        icon: 'H',
      }).success,
    ).toBe(true)

    expect(
      RailItemSchema.safeParse({
        id: '',
        label: 'Broken',
        icon: undefined,
      }).success,
    ).toBe(false)
  })

  it('parses a valid rail section and rejects an invalid one', () => {
    expect(
      RailSectionSchema.safeParse({
        id: 'library',
        label: 'Library',
        items: [{ id: 'skills', label: 'Skills', icon: 'S' }],
        collapsible: true,
      }).success,
    ).toBe(true)

    expect(
      RailSectionSchema.safeParse({
        id: 'library',
        label: 'Library',
        items: [{ id: 'skills', label: '', icon: 'S' }],
      }).success,
    ).toBe(false)
  })

  it('parses a valid project item and rejects an invalid one', () => {
    expect(
      ProjectItemSchema.safeParse({
        id: 'project-1',
        name: 'Project One',
      }).success,
    ).toBe(true)

    expect(
      ProjectItemSchema.safeParse({
        id: 'project-1',
        name: '',
      }).success,
    ).toBe(false)
  })

  it('parses a valid flyout item and rejects an invalid one', () => {
    expect(
      FlyoutItemSchema.safeParse({
        id: 'recent-thread',
        label: 'Recent Thread',
        description: 'Latest thread',
        timestamp: Date.now(),
      }).success,
    ).toBe(true)

    expect(
      FlyoutItemSchema.safeParse({
        id: 'recent-thread',
        label: 'Recent Thread',
        timestamp: Number.NaN,
      }).success,
    ).toBe(false)
  })

  it('parses shell breakpoints and rejects invalid values', () => {
    expect(ShellBreakpointSchema.safeParse('medium').success).toBe(true)
    expect(ShellBreakpointSchema.safeParse('mobile').success).toBe(false)
  })

  it('parses column widths and rejects invalid values', () => {
    expect(
      ColumnWidthsSchema.safeParse({
        chat: 320,
        content: 640,
        observe: 280,
      }).success,
    ).toBe(true)

    expect(
      ColumnWidthsSchema.safeParse({
        chat: -1,
        content: 640,
        observe: 280,
      }).success,
    ).toBe(false)
  })

  it('parses content routes and rejects non-component values', () => {
    expect(
      ContentRouteSchema.safeParse({
        id: 'home',
        label: 'Home',
        component: () => null,
      }).success,
    ).toBe(true)

    expect(
      ContentRouteSchema.safeParse({
        id: 'home',
        label: 'Home',
        component: 'not-a-component',
      }).success,
    ).toBe(false)
  })

  it('exports the default conversation context as a valid stub', () => {
    const conversation: ConversationContext = defaultConversationContext

    expect(conversation).toEqual({
      tier: 'transient',
      threadId: null,
      projectId: null,
      isAmbient: true,
    })
  })

  it('parses valid ObserveRoute values and rejects invalid ones', () => {
    const maoRoute: ObserveRoute = 'mao'
    expect(maoRoute).toBe('mao')
    expect(ObserveRouteSchema.safeParse('mao').success).toBe(true)
    expect(ObserveRouteSchema.safeParse('default').success).toBe(true)
    expect(ObserveRouteSchema.safeParse('agent-logs').success).toBe(true)
    expect(ObserveRouteSchema.safeParse('metrics').success).toBe(true)
    expect(ObserveRouteSchema.safeParse('unknown').success).toBe(false)
  })

  it('parses valid ObservePanelProps and rejects invalid shapes', () => {
    expect(ObservePanelPropsSchema.safeParse({}).success).toBe(true)
    expect(ObservePanelPropsSchema.safeParse({ className: 'test' }).success).toBe(true)
    expect(ObservePanelPropsSchema.safeParse({ maoApi: {} }).success).toBe(true)
  })

  it('parses valid ChatSurfaceProps', () => {
    expect(ChatSurfacePropsSchema.safeParse({}).success).toBe(true)
    expect(ChatSurfacePropsSchema.safeParse({ className: 'test' }).success).toBe(true)
    expect(ChatSurfacePropsSchema.safeParse({ chatApi: {} }).success).toBe(true)
  })

  it('parses valid MAOSurfaceProps', () => {
    expect(MAOSurfacePropsSchema.safeParse({}).success).toBe(true)
    expect(MAOSurfacePropsSchema.safeParse({ className: 'custom' }).success).toBe(true)
    expect(MAOSurfacePropsSchema.safeParse({ maoApi: {} }).success).toBe(true)
  })

  it('parses valid HomeScreenProps with required and optional fields', () => {
    const navigate = () => {}
    const goBack = () => {}

    expect(
      HomeScreenPropsSchema.safeParse({
        navigate,
        goBack,
        canGoBack: false,
      }).success,
    ).toBe(true)

    expect(
      HomeScreenPropsSchema.safeParse({
        navigate,
        goBack,
        canGoBack: true,
        greeting: 'Hello!',
        recentActivity: [
          { id: 'a1', label: 'Activity 1' },
          { id: 'a2', label: 'Activity 2', timestamp: 1234567890, icon: 'star' },
        ],
      }).success,
    ).toBe(true)

    // Missing required fields
    expect(HomeScreenPropsSchema.safeParse({}).success).toBe(false)
    expect(HomeScreenPropsSchema.safeParse({ navigate }).success).toBe(false)

    // Invalid recentActivity
    expect(
      HomeScreenPropsSchema.safeParse({
        navigate,
        goBack,
        canGoBack: false,
        recentActivity: [{ id: '', label: '' }],
      }).success,
    ).toBe(false)
  })

  // --- CatalogItem ---

  it('parses valid CatalogItem and rejects invalid ones', () => {
    expect(
      CatalogItemSchema.safeParse({
        id: 'item-1',
        title: 'Test Item',
        description: 'A description',
        icon: 'star',
        metadata: { category: 'tools' },
      }).success,
    ).toBe(true)

    // Valid with optional fields omitted
    expect(
      CatalogItemSchema.safeParse({ id: 'item-2', title: 'Minimal' }).success,
    ).toBe(true)

    // Invalid: empty id
    expect(
      CatalogItemSchema.safeParse({ id: '', title: 'Bad' }).success,
    ).toBe(false)

    // Invalid: empty title
    expect(
      CatalogItemSchema.safeParse({ id: 'ok', title: '' }).success,
    ).toBe(false)
  })

  // --- CatalogFilterGroup ---

  it('parses valid CatalogFilterGroup and rejects invalid ones', () => {
    expect(
      CatalogFilterGroupSchema.safeParse({
        id: 'category',
        label: 'Category',
        options: [{ id: 'tools', label: 'Tools' }],
      }).success,
    ).toBe(true)

    // Valid with empty options array
    expect(
      CatalogFilterGroupSchema.safeParse({
        id: 'category',
        label: 'Category',
        options: [],
      }).success,
    ).toBe(true)

    // Invalid: empty id
    expect(
      CatalogFilterGroupSchema.safeParse({
        id: '',
        label: 'Category',
        options: [],
      }).success,
    ).toBe(false)
  })

  // --- CatalogSortOption ---

  it('parses valid CatalogSortOption and rejects invalid ones', () => {
    expect(
      CatalogSortOptionSchema.safeParse({
        id: 'alpha',
        label: 'Alphabetical',
        comparator: (a: any, b: any) => a.title.localeCompare(b.title),
      }).success,
    ).toBe(true)

    // Invalid: non-function comparator
    expect(
      CatalogSortOptionSchema.safeParse({
        id: 'alpha',
        label: 'Alphabetical',
        comparator: 'not-a-function',
      }).success,
    ).toBe(false)

    // Invalid: empty id
    expect(
      CatalogSortOptionSchema.safeParse({
        id: '',
        label: 'Alphabetical',
        comparator: () => 0,
      }).success,
    ).toBe(false)
  })

  // --- CatalogViewProps ---

  it('parses valid CatalogViewProps and rejects invalid ones', () => {
    const navigate = () => {}
    const goBack = () => {}

    expect(
      CatalogViewPropsSchema.safeParse({
        navigate,
        goBack,
        canGoBack: false,
        items: [{ id: 'i1', title: 'Item 1' }],
      }).success,
    ).toBe(true)

    // Valid with all optional fields
    expect(
      CatalogViewPropsSchema.safeParse({
        navigate,
        goBack,
        canGoBack: true,
        items: [],
        loading: true,
        onItemClick: () => {},
        sortOptions: [{ id: 'a', label: 'A', comparator: () => 0 }],
        filterGroups: [{ id: 'fg', label: 'FG', options: [] }],
        defaultViewMode: 'list',
        emptyMessage: 'Empty',
        className: 'test',
      }).success,
    ).toBe(true)

    // Invalid: missing items
    expect(
      CatalogViewPropsSchema.safeParse({
        navigate,
        goBack,
        canGoBack: false,
      }).success,
    ).toBe(false)
  })

  // --- CommandItem ---

  it('parses valid CommandItem and rejects invalid ones', () => {
    expect(
      CommandItemSchema.safeParse({
        id: 'cmd-1',
        label: 'Test Command',
        action: () => {},
      }).success,
    ).toBe(true)

    // Valid with optional fields
    expect(
      CommandItemSchema.safeParse({
        id: 'cmd-2',
        label: 'Full Command',
        shortcut: 'Ctrl+K',
        section: 'nav',
        action: () => {},
      }).success,
    ).toBe(true)

    // Invalid: non-function action
    expect(
      CommandItemSchema.safeParse({
        id: 'cmd-3',
        label: 'Bad Command',
        action: 'not-a-function',
      }).success,
    ).toBe(false)

    // Invalid: empty id
    expect(
      CommandItemSchema.safeParse({
        id: '',
        label: 'Bad',
        action: () => {},
      }).success,
    ).toBe(false)
  })

  // --- CommandGroup ---

  it('parses valid CommandGroup and rejects invalid ones', () => {
    expect(
      CommandGroupSchema.safeParse({
        id: 'group-1',
        label: 'Navigation',
        commands: [{ id: 'cmd-1', label: 'Home', action: () => {} }],
      }).success,
    ).toBe(true)

    // Valid with empty commands
    expect(
      CommandGroupSchema.safeParse({
        id: 'group-2',
        label: 'Empty',
        commands: [],
      }).success,
    ).toBe(true)

    // Invalid: non-array commands
    expect(
      CommandGroupSchema.safeParse({
        id: 'group-3',
        label: 'Bad',
        commands: 'not-array',
      }).success,
    ).toBe(false)
  })

  // --- CommandPaletteProps ---

  it('parses valid CommandPaletteProps and rejects invalid ones', () => {
    expect(
      CommandPalettePropsSchema.safeParse({
        isOpen: true,
        onClose: () => {},
        commands: [
          { id: 'g1', label: 'Group', commands: [{ id: 'c1', label: 'Cmd', action: () => {} }] },
        ],
      }).success,
    ).toBe(true)

    // Invalid: missing onClose
    expect(
      CommandPalettePropsSchema.safeParse({
        isOpen: true,
        commands: [],
      }).success,
    ).toBe(false)

    // Invalid: missing commands
    expect(
      CommandPalettePropsSchema.safeParse({
        isOpen: true,
        onClose: () => {},
      }).success,
    ).toBe(false)
  })
})
