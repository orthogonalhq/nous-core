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
})
