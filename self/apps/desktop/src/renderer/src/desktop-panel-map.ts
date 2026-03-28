import {
  AppIframePanel,
  PlaceholderPanel,
  FileBrowserPanel,
  NodeProjectionPanel,
  MAOPanel,
  CodexBarPanel,
  DashboardPanel,
  AgentPanel,
  WorkflowBuilderPanel,
} from '@nous/ui/panels'
import { DesktopChatPanel } from './desktop-chat-wrappers'
import { AppInstallWizardPanel } from './components/AppInstallWizard'
import { ConnectedPreferencesPanel } from './components/ConnectedPreferencesPanel'

export const panelComponents = {
  'app-installer': AppInstallWizardPanel,
  'app-iframe': AppIframePanel,
  placeholder: PlaceholderPanel,
  chat: DesktopChatPanel,
  'file-browser': FileBrowserPanel,
  'node-projection': NodeProjectionPanel,
  mao: MAOPanel,
  codexbar: CodexBarPanel,
  dashboard: DashboardPanel,
  'coding-agents': AgentPanel,
  preferences: ConnectedPreferencesPanel,
  'workflow-builder': WorkflowBuilderPanel,
}
