import {
  PlaceholderPanel,
  NodeProjectionPanel,
  MAOPanel,
  CodexBarPanel,
  DashboardPanel,
  AgentPanel,
  WorkflowBuilderPanel,
} from '@nous/ui/panels'
import { WebChatPanel } from './web-chat-wrappers'
import { WebConnectedPreferencesPanel } from './web-connected-preferences-panel'

export const webPanelComponents = {
  placeholder: PlaceholderPanel,
  chat: WebChatPanel,
  'node-projection': NodeProjectionPanel,
  mao: MAOPanel,
  codexbar: CodexBarPanel,
  dashboard: DashboardPanel,
  'coding-agents': AgentPanel,
  preferences: WebConnectedPreferencesPanel,
  'workflow-builder': WorkflowBuilderPanel,
}
