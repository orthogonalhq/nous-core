'use client'

import type { ComponentType, ReactNode } from 'react'
import { z } from 'zod'

const requiredReactNodeSchema = z.custom<ReactNode>(
  (value) => value !== null && value !== undefined,
  'React node is required',
)

const optionalReactNodeSchema = z.custom<ReactNode>(
  () => true,
)

const componentTypeSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === 'function',
  'Component type is required',
)

export const ShellModeSchema = z.enum(['simple', 'developer'])
export type ShellMode = z.infer<typeof ShellModeSchema>

export const RailItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: requiredReactNodeSchema,
  badge: z.string().min(1).optional(),
  disabled: z.boolean().optional(),
})
export type RailItem = z.infer<typeof RailItemSchema>

export const RailSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  items: z.array(RailItemSchema),
  collapsible: z.boolean().optional(),
  defaultCollapsed: z.boolean().optional(),
})
export type RailSection = z.infer<typeof RailSectionSchema>

export const ProjectItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: optionalReactNodeSchema.optional(),
})
export type ProjectItem = z.infer<typeof ProjectItemSchema>

export const FlyoutItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: optionalReactNodeSchema.optional(),
  description: z.string().min(1).optional(),
  timestamp: z.number().finite().optional(),
})
export type FlyoutItem = z.infer<typeof FlyoutItemSchema>

export const ShellBreakpointSchema = z.enum(['full', 'medium', 'narrow'])
export type ShellBreakpoint = z.infer<typeof ShellBreakpointSchema>

export const ColumnWidthsSchema = z.object({
  chat: z.number().nonnegative(),
  content: z.number().nonnegative(),
  observe: z.number().nonnegative(),
})
export type ColumnWidths = z.infer<typeof ColumnWidthsSchema>

export const ContentRouteSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  component: componentTypeSchema,
  parent: z.string().min(1).optional(),
})
export type ContentRoute = z.infer<typeof ContentRouteSchema>

export interface NavigationState {
  activeRoute: string
  history: string[]
  canGoBack: boolean
}

export interface ConversationContext {
  tier: 'transient' | 'thread' | 'project'
  threadId: string | null
  projectId: string | null
  isAmbient: boolean
}

export const defaultConversationContext: ConversationContext = {
  tier: 'transient',
  threadId: null,
  projectId: null,
  isAmbient: true,
}

export interface ShellContextValue {
  mode: ShellMode
  breakpoint: ShellBreakpoint
  activeRoute: string
  navigation: NavigationState
  conversation: ConversationContext
  activeProjectId: string | null
  navigate: (routeId: string) => void
  goBack: () => void
}
