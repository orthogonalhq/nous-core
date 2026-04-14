import {
  AppIframePanel,
  PlaceholderPanel,
  FileBrowserPanel,
  NodeProjectionPanel,
  CodexBarPanel,
  DashboardPanel,
  AgentPanel,
  WorkflowBuilderPanel,
} from '@nous/ui/panels'
import { DesktopChatPanel } from './desktop-chat-wrappers'
import { AppInstallWizardPanel } from './components/AppInstallWizard'
import { ConnectedPreferencesPanel } from './components/ConnectedPreferencesPanel'
import { DesktopMaoPanel } from './components/DesktopMaoPanel'

export const panelComponents = {
  'app-installer': AppInstallWizardPanel,
  'app-iframe': AppIframePanel,
  placeholder: PlaceholderPanel,
  chat: DesktopChatPanel,
  'file-browser': FileBrowserPanel,
  'node-projection': NodeProjectionPanel,
  mao: DesktopMaoPanel,
  codexbar: CodexBarPanel,
  dashboard: DashboardPanel,
  'coding-agents': AgentPanel,
  preferences: ConnectedPreferencesPanel,
  'workflow-builder': WorkflowBuilderPanel,
}
