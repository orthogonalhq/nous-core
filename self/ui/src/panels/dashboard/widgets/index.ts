import { SystemStatusWidget } from './SystemStatusWidget'
import { ActiveAgentsWidget } from './ActiveAgentsWidget'
import { ProviderHealthWidget } from './ProviderHealthWidget'
import { RecentEventsWidget } from './RecentEventsWidget'
import { TokenUsageWidget } from './TokenUsageWidget'

export const dashboardWidgets = {
  'system-status': SystemStatusWidget,
  'active-agents': ActiveAgentsWidget,
  'provider-health': ProviderHealthWidget,
  'recent-events': RecentEventsWidget,
  'token-usage': TokenUsageWidget,
}

export type WidgetDef = { id: string; component: string; title: string }

export const WIDGET_DEFS: WidgetDef[] = [
  { id: 'system-status', component: 'system-status', title: 'System Status' },
  { id: 'active-agents', component: 'active-agents', title: 'Active Agents' },
  { id: 'provider-health', component: 'provider-health', title: 'Provider Health' },
  { id: 'token-usage', component: 'token-usage', title: 'Token Usage' },
  { id: 'recent-events', component: 'recent-events', title: 'Recent Events' },
]
