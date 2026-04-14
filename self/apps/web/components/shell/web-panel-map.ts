import {
  PlaceholderPanel,
  NodeProjectionPanel,
  CodexBarPanel,
  DashboardPanel,
  AgentPanel,
  WorkflowBuilderPanel,
} from '@nous/ui/panels'
import { WebChatPanel } from './web-chat-wrappers'
import { WebConnectedPreferencesPanel } from './web-connected-preferences-panel'
import { WebMaoPanel } from './web-mao-panel'

export const webPanelComponents = {
  placeholder: PlaceholderPanel,
  chat: WebChatPanel,
  'node-projection': NodeProjectionPanel,
  mao: WebMaoPanel,
  codexbar: CodexBarPanel,
  dashboard: DashboardPanel,
  'coding-agents': AgentPanel,
  preferences: WebConnectedPreferencesPanel,
  'workflow-builder': WorkflowBuilderPanel,
}
