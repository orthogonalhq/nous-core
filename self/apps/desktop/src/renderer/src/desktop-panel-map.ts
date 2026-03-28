import {
  AppIframePanel,
  PlaceholderPanel,
  FileBrowserPanel,
  NodeProjectionPanel,
  MAOPanel,
  CodexBarPanel,
  DashboardPanel,
  AgentPanel,
  PreferencesPanel,
  WorkflowBuilderPanel,
} from '@nous/ui/panels'
import { DesktopChatPanel } from './desktop-chat-wrappers'
import { AppInstallWizardPanel } from './components/AppInstallWizard'

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
  preferences: PreferencesPanel,
  'workflow-builder': WorkflowBuilderPanel,
}
