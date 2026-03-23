import type { ConversationContext, ShellMode } from '../types'
import {
  ColumnWidthsSchema,
  ContentRouteSchema,
  FlyoutItemSchema,
  ProjectItemSchema,
  RailItemSchema,
  RailSectionSchema,
  ShellBreakpointSchema,
  ShellModeSchema,
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
})
