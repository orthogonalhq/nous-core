import type { ChatStage, ConversationContext, ObserveRoute, ShellMode } from '../types'
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
  HomeScreenPropsSchema,
  defaultConversationContext,
  CatalogItemSchema,
  CatalogFilterGroupSchema,
  CatalogSortOptionSchema,
  CatalogViewPropsSchema,
  CommandItemSchema,
  CommandGroupSchema,
  CommandPalettePropsSchema,
  ChatStageSchema,
  SidebarTopNavItemSchema,
  AssetSectionItemSchema,
  AssetSectionSchema,
  AssetSidebarPropsSchema,
  ProjectSwitcherRailPropsSchema,
  SimpleShellLayoutPropsSchema,
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

  // --- Sub-phase 1.1: retype icon -> string, add archived/color ---
  it('accepts icon as string (sub-phase 1.1 retype)', () => {
    expect(
      ProjectItemSchema.safeParse({
        id: 'project-1',
        name: 'Project One',
        icon: 'lucide:Rocket',
      }).success,
    ).toBe(true)
  })

  it('accepts archived boolean and hex color', () => {
    expect(
      ProjectItemSchema.safeParse({
        id: 'project-1',
        name: 'Project One',
        archived: true,
        color: '#00aaff',
      }).success,
    ).toBe(true)
  })

  it('rejects malformed color (not #RRGGBB)', () => {
    expect(
      ProjectItemSchema.safeParse({
        id: 'project-1',
        name: 'Project One',
        color: '#abc',
      }).success,
    ).toBe(false)
  })

  it('rejects oversized icon (> 64 chars)', () => {
    expect(
      ProjectItemSchema.safeParse({
        id: 'project-1',
        name: 'Project One',
        icon: 'x'.repeat(65),
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
  })

  it('parses valid ChatSurfaceProps', () => {
    expect(ChatSurfacePropsSchema.safeParse({}).success).toBe(true)
    expect(ChatSurfacePropsSchema.safeParse({ className: 'test' }).success).toBe(true)
    expect(ChatSurfacePropsSchema.safeParse({ chatApi: {} }).success).toBe(true)
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

  // --- Simple Shell Types ---

  it('parses valid ChatStage values and rejects invalid ones', () => {
    const small: ChatStage = 'small'
    expect(small).toBe('small')
    expect(ChatStageSchema.safeParse('small').success).toBe(true)
    expect(ChatStageSchema.safeParse('ambient_small').success).toBe(true)
    expect(ChatStageSchema.safeParse('ambient_large').success).toBe(true)
    expect(ChatStageSchema.safeParse('full').success).toBe(true)
    expect(ChatStageSchema.options).toEqual(['small', 'ambient_small', 'ambient_large', 'full'])
    expect(ChatStageSchema.safeParse('large').success).toBe(false)
    expect(ChatStageSchema.safeParse('peek').success).toBe(false)
    expect(ChatStageSchema.safeParse('').success).toBe(false)
  })

  it('parses valid SidebarTopNavItem and rejects invalid ones', () => {
    expect(
      SidebarTopNavItemSchema.safeParse({
        id: 'nav-1',
        label: 'Dashboard',
        icon: 'D',
        routeId: 'dashboard',
      }).success,
    ).toBe(true)

    // Invalid: missing icon
    expect(
      SidebarTopNavItemSchema.safeParse({
        id: 'nav-1',
        label: 'Dashboard',
        routeId: 'dashboard',
      }).success,
    ).toBe(false)

    // Invalid: empty id
    expect(
      SidebarTopNavItemSchema.safeParse({
        id: '',
        label: 'Dashboard',
        icon: 'D',
        routeId: 'dashboard',
      }).success,
    ).toBe(false)
  })

  it('parses valid AssetSectionItem and rejects invalid ones', () => {
    expect(
      AssetSectionItemSchema.safeParse({
        id: 'item-1',
        label: 'Deploy v2.1',
        routeId: 'tasks',
      }).success,
    ).toBe(true)

    // Valid with optional fields
    expect(
      AssetSectionItemSchema.safeParse({
        id: 'item-2',
        label: 'Engineering',
        icon: 'E',
        indicatorColor: '#007acc',
        routeId: 'teams',
      }).success,
    ).toBe(true)

    // Invalid: empty label
    expect(
      AssetSectionItemSchema.safeParse({
        id: 'item-3',
        label: '',
        routeId: 'tasks',
      }).success,
    ).toBe(false)

    // Invalid: missing routeId
    expect(
      AssetSectionItemSchema.safeParse({
        id: 'item-4',
        label: 'Item',
      }).success,
    ).toBe(false)
  })

  it('parses valid AssetSection and rejects invalid ones', () => {
    expect(
      AssetSectionSchema.safeParse({
        id: 'tasks',
        label: 'Tasks',
        items: [{ id: 'task-1', label: 'Deploy v2.1', routeId: 'tasks' }],
        collapsible: true,
      }).success,
    ).toBe(true)

    // Valid with optional fields
    expect(
      AssetSectionSchema.safeParse({
        id: 'agents',
        label: 'Agents',
        items: [],
        collapsible: false,
        defaultCollapsed: true,
        disabled: true,
        onAdd: () => {},
        onSettings: () => {},
      }).success,
    ).toBe(true)

    // Invalid: missing collapsible (required boolean)
    expect(
      AssetSectionSchema.safeParse({
        id: 'tasks',
        label: 'Tasks',
        items: [],
      }).success,
    ).toBe(false)

    // Invalid: non-function onAdd
    expect(
      AssetSectionSchema.safeParse({
        id: 'tasks',
        label: 'Tasks',
        items: [],
        collapsible: true,
        onAdd: 'not-a-function',
      }).success,
    ).toBe(false)
  })

  it('parses valid ProjectSwitcherRailProps and rejects invalid ones', () => {
    expect(
      ProjectSwitcherRailPropsSchema.safeParse({
        projects: [{ id: 'p1', name: 'Project One' }],
        activeProjectId: 'p1',
        onProjectSelect: () => {},
      }).success,
    ).toBe(true)

    // Valid with optional fields
    expect(
      ProjectSwitcherRailPropsSchema.safeParse({
        projects: [{ id: 'p1', name: 'Project One' }],
        activeProjectId: 'p1',
        onProjectSelect: () => {},
        onNewProject: () => {},
        brandSlot: 'logo',
      }).success,
    ).toBe(true)

    // Invalid: missing onProjectSelect
    expect(
      ProjectSwitcherRailPropsSchema.safeParse({
        projects: [],
        activeProjectId: 'p1',
      }).success,
    ).toBe(false)

    // Invalid: non-function onProjectSelect
    expect(
      ProjectSwitcherRailPropsSchema.safeParse({
        projects: [],
        activeProjectId: 'p1',
        onProjectSelect: 'not-a-function',
      }).success,
    ).toBe(false)
  })

  it('parses valid AssetSidebarProps and rejects invalid ones', () => {
    expect(
      AssetSidebarPropsSchema.safeParse({
        projectName: 'My Project',
        topNav: [{ id: 'n1', label: 'Dashboard', icon: 'D', routeId: 'dashboard' }],
        sections: [
          { id: 's1', label: 'Tasks', items: [], collapsible: true },
        ],
        activeRoute: 'dashboard',
        onNavigate: () => {},
      }).success,
    ).toBe(true)

    // Invalid: missing onNavigate
    expect(
      AssetSidebarPropsSchema.safeParse({
        projectName: 'My Project',
        topNav: [],
        sections: [],
        activeRoute: 'dashboard',
      }).success,
    ).toBe(false)
  })

  it('parses valid SimpleShellLayoutProps and rejects invalid ones', () => {
    expect(
      SimpleShellLayoutPropsSchema.safeParse({
        projectRail: 'rail',
        sidebar: 'sidebar',
        content: 'content',
        observe: 'observe',
        chatSlot: () => null,
      }).success,
    ).toBe(true)

    // Valid with all optional fields
    expect(
      SimpleShellLayoutPropsSchema.safeParse({
        projectRail: 'rail',
        sidebar: 'sidebar',
        content: 'content',
        observe: 'observe',
        chatSlot: () => null,
        breakpoint: 'full',
        onColumnResize: () => {},
        initialWidths: { sidebar: 320, observe: 280 },
      }).success,
    ).toBe(true)

    // Valid with partial initialWidths
    expect(
      SimpleShellLayoutPropsSchema.safeParse({
        projectRail: 'rail',
        sidebar: 'sidebar',
        content: 'content',
        observe: 'observe',
        chatSlot: () => null,
        initialWidths: { sidebar: 320 },
      }).success,
    ).toBe(true)

    // Invalid: missing required slot (content)
    expect(
      SimpleShellLayoutPropsSchema.safeParse({
        projectRail: 'rail',
        sidebar: 'sidebar',
        observe: 'observe',
      }).success,
    ).toBe(false)

    // Invalid: null required slot
    expect(
      SimpleShellLayoutPropsSchema.safeParse({
        projectRail: null,
        sidebar: 'sidebar',
        content: 'content',
        observe: 'observe',
      }).success,
    ).toBe(false)

    // Invalid: negative initialWidths
    expect(
      SimpleShellLayoutPropsSchema.safeParse({
        projectRail: 'rail',
        sidebar: 'sidebar',
        content: 'content',
        observe: 'observe',
        initialWidths: { sidebar: -1 },
      }).success,
    ).toBe(false)
  })
})
