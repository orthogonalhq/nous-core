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
  onProjectChange?: (projectId: string) => void
}

// --- Content Surface Types ---

import type { ContentRouterRenderProps } from './ContentRouter'

/** Routes available in the observe column */
export const ObserveRouteSchema = z.enum(['mao', 'agent-logs', 'metrics', 'default', 'system-activity'])
export type ObserveRoute = z.infer<typeof ObserveRouteSchema>

/** Props for the ObservePanel container */
export const ObservePanelPropsSchema = z.object({
  className: z.string().optional(),
})
export interface ObservePanelProps {
  className?: string
}

// --- Chat Stage Types ---

export const ChatStageSchema = z.enum(['small', 'ambient_small', 'ambient_large', 'peek', 'full'])
export type ChatStage = z.infer<typeof ChatStageSchema>

/** Return type of the useChatStageManager hook */
export interface ChatStageManagerReturn {
  chatStage: ChatStage
  /** User sent a message */
  signalSending: () => void
  /** Agent started an inference call */
  signalInferenceStart: () => void
  /** PFC emitted a decision thought */
  signalPfcDecision: () => void
  /** Turn completed — start idle timers */
  signalTurnComplete: () => void
  /** User clicked expand chevron (any non-full -> peek) */
  expandToPeek: () => void
  /** User clicked maximize chevron (peek -> full) */
  expandToFull: () => void
  /** User clicked minimize chevron (full -> peek) */
  minimizeToPeek: () => void
  /** Collapse to small (click outside or explicit dismiss) */
  collapseToSmall: () => void
  /** Handler for click-outside events */
  handleClickOutside: () => void
}

/** Props for the ChatSurface adapter */
export const ChatSurfacePropsSchema = z.object({
  chatApi: z.custom<Record<string, unknown>>(() => true).optional(),
  className: z.string().optional(),
  stage: ChatStageSchema.optional(),
  onStageChange: z.custom<(stage: ChatStage) => void>(() => true).optional(),
  onSendStart: z.custom<() => void>(() => true).optional(),
})
export interface ChatSurfaceProps {
  chatApi?: import('../../panels/ChatPanel').ChatAPI
  className?: string
  stage?: ChatStage
  onStageChange?: (stage: ChatStage) => void
  onSendStart?: () => void
}

/** Props for the HomeScreen landing surface */
export const HomeScreenPropsSchema = z.object({
  navigate: z.function().args(z.string()).returns(z.void()),
  goBack: z.function().args().returns(z.void()),
  canGoBack: z.boolean(),
  greeting: z.string().optional(),
  recentActivity: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    timestamp: z.number().optional(),
    icon: z.string().optional(),
  })).optional(),
})
export interface HomeScreenProps extends ContentRouterRenderProps {
  greeting?: string
  recentActivity?: Array<{
    id: string
    label: string
    timestamp?: number
    icon?: string
  }>
}

// --- CatalogItem ---

export const CatalogItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})
export type CatalogItem = z.infer<typeof CatalogItemSchema>

// --- CatalogFilterGroup ---

export const CatalogFilterOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
})
export type CatalogFilterOption = z.infer<typeof CatalogFilterOptionSchema>

export const CatalogFilterGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  options: z.array(CatalogFilterOptionSchema),
})
export type CatalogFilterGroup = z.infer<typeof CatalogFilterGroupSchema>

// --- CatalogSortOption ---

const comparatorFnSchema = z.custom<(a: CatalogItem, b: CatalogItem) => number>(
  (value) => typeof value === 'function',
  'Comparator function is required',
)

export const CatalogSortOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  comparator: comparatorFnSchema,
})
export type CatalogSortOption = z.infer<typeof CatalogSortOptionSchema>

// --- CatalogViewProps ---

export const CatalogViewPropsSchema = z.object({
  navigate: z.function().args(z.string()).returns(z.void()),
  goBack: z.function().args().returns(z.void()),
  canGoBack: z.boolean(),
  items: z.array(CatalogItemSchema),
  loading: z.boolean().optional(),
  onItemClick: z.custom<(item: CatalogItem) => void>(() => true).optional(),
  sortOptions: z.array(CatalogSortOptionSchema).optional(),
  filterGroups: z.array(CatalogFilterGroupSchema).optional(),
  defaultViewMode: z.enum(['grid', 'list']).optional(),
  emptyMessage: z.string().optional(),
  className: z.string().optional(),
})
export interface CatalogViewProps extends ContentRouterRenderProps {
  items: CatalogItem[]
  loading?: boolean
  onItemClick?: (item: CatalogItem) => void
  sortOptions?: CatalogSortOption[]
  filterGroups?: CatalogFilterGroup[]
  defaultViewMode?: 'grid' | 'list'
  emptyMessage?: string
  className?: string
}

// --- CommandItem ---

export const CommandItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  shortcut: z.string().optional(),
  section: z.string().optional(),
  action: z.custom<() => void>(
    (value) => typeof value === 'function',
    'Action function is required',
  ),
})
export type CommandItem = z.infer<typeof CommandItemSchema>

// --- CommandGroup ---

export const CommandGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  commands: z.array(CommandItemSchema),
})
export type CommandGroup = z.infer<typeof CommandGroupSchema>

// --- CommandPaletteProps ---

export const CommandPalettePropsSchema = z.object({
  isOpen: z.boolean(),
  onClose: z.custom<() => void>(
    (value) => typeof value === 'function',
    'onClose function is required',
  ),
  commands: z.array(CommandGroupSchema),
})
export interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  commands: CommandGroup[]
}

// --- Simple Shell Types ---

export const SidebarTopNavItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: requiredReactNodeSchema,
  routeId: z.string().min(1),
})
export type SidebarTopNavItem = z.infer<typeof SidebarTopNavItemSchema>

export const AssetSectionItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: optionalReactNodeSchema.optional(),
  indicatorColor: z.string().min(1).optional(),
  routeId: z.string().min(1),
})
export type AssetSectionItem = z.infer<typeof AssetSectionItemSchema>

export const AssetSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  items: z.array(AssetSectionItemSchema),
  collapsible: z.boolean(),
  defaultCollapsed: z.boolean().optional(),
  disabled: z.boolean().optional(),
  onAdd: z.custom<() => void>(
    (value) => typeof value === 'function',
    'onAdd function is required',
  ).optional(),
  onSettings: z.custom<() => void>(
    (value) => typeof value === 'function',
    'onSettings function is required',
  ).optional(),
})
export type AssetSection = z.infer<typeof AssetSectionSchema>

export const ProjectSwitcherRailPropsSchema = z.object({
  projects: z.array(ProjectItemSchema),
  activeProjectId: z.string().min(1),
  onProjectSelect: z.custom<(projectId: string) => void>(
    (value) => typeof value === 'function',
    'onProjectSelect function is required',
  ),
  onNewProject: z.custom<() => void>(
    (value) => typeof value === 'function',
    'onNewProject function is required',
  ).optional(),
  brandSlot: optionalReactNodeSchema.optional(),
})
export type ProjectSwitcherRailProps = z.infer<typeof ProjectSwitcherRailPropsSchema>

export const AssetSidebarPropsSchema = z.object({
  projectName: z.string().min(1),
  topNav: z.array(SidebarTopNavItemSchema),
  sections: z.array(AssetSectionSchema),
  activeRoute: z.string().min(1),
  onNavigate: z.custom<(routeId: string) => void>(
    (value) => typeof value === 'function',
    'onNavigate function is required',
  ),
})
export type AssetSidebarProps = z.infer<typeof AssetSidebarPropsSchema>

export const SimpleShellLayoutPropsSchema = z.object({
  projectRail: requiredReactNodeSchema,
  sidebar: requiredReactNodeSchema,
  content: requiredReactNodeSchema,
  observe: requiredReactNodeSchema,
  chatSlot: z.custom<(props: { stage: ChatStage; onStageChange: (stage: ChatStage) => void }) => ReactNode>(
    (value) => typeof value === 'function',
    'chatSlot render function is required',
  ),
  chatStage: ChatStageSchema.optional(),
  onClickOutside: z.custom<() => void>(
    (value) => typeof value === 'function',
    'onClickOutside function is required',
  ).optional(),
  breakpoint: ShellBreakpointSchema.optional(),
  onColumnResize: z.custom<(widths: { sidebar: number; observe: number }) => void>(
    (value) => typeof value === 'function',
    'onColumnResize function is required',
  ).optional(),
  initialWidths: z.object({
    sidebar: z.number().nonnegative().optional(),
    observe: z.number().nonnegative().optional(),
  }).optional(),
})
export type SimpleShellLayoutProps = z.infer<typeof SimpleShellLayoutPropsSchema>
