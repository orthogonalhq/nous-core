/**
 * NousContext — server-side context for tRPC procedures.
 *
 * Re-exported from the shared-server package so both web and desktop
 * can import the same type without coupling to each other.
 */
import type {
  ICoreExecutor,
  IKnowledgeIndex,
  IArtifactStore,
  IScheduler,
  IProjectStore,
  IStmStore,
  IWorkflowEngine,
  IWitnessService,
  IOpctlService,
  IMaoProjectionService,
  IGtmGateCalculator,
  IEscalationService,
  IEndpointTrustService,
  IRegistryService,
  INudgeDiscoveryService,
  IAppInstallService,
  IAppSettingsService,
  IPackageInstallService,
  IVoiceControlService,
  IPublicMcpGatewayService,
  IAppRuntimeService,
  ICredentialVaultService,
} from '@nous/shared';
import type { PanelTranspiler } from '@nous/subcortex-apps';
import type { ProviderRegistry } from '@nous/subcortex-providers';
import type {
  IPrincipalSystemGatewayRuntime,
  IPublicMcpExecutionBridge,
} from '@nous/cortex-core';
import type { MwcPipeline } from '@nous/memory-mwc';
import type { IDocumentStore } from '@nous/shared';
import type { IModelRouter } from '@nous/shared';
import type { IConfig } from '@nous/shared';
import type { ProviderId } from '@nous/shared';
import type { IModelProvider } from '@nous/shared';

/** Agent session tracking for coding agent pipeline. */
export interface AgentSessionEntry {
  id: string;
  workflowRunId: string;
  agentName: string;
  agentType: string;
  status: 'running' | 'waiting' | 'completed' | 'failed' | 'idle';
  messages: Array<{
    id: string;
    role: 'agent' | 'system' | 'tool';
    content: string;
    timestamp: string;
    toolCall?: {
      id: string;
      toolName: string;
      input: unknown;
      output?: unknown;
      governance: 'allowed' | 'denied';
      timestamp: string;
    };
  }>;
}

export interface NousContext {
  coreExecutor: ICoreExecutor;
  gatewayRuntime: IPrincipalSystemGatewayRuntime;
  projectStore: IProjectStore;
  stmStore: IStmStore;
  mwcPipeline: MwcPipeline;
  documentStore: IDocumentStore;
  config: IConfig;
  router: IModelRouter;
  getProvider: (id: ProviderId) => IModelProvider | null;
  witnessService: IWitnessService;
  opctlService: IOpctlService;
  maoProjectionService: IMaoProjectionService;
  gtmGateCalculator: IGtmGateCalculator;
  knowledgeIndex: IKnowledgeIndex;
  workflowEngine: IWorkflowEngine;
  artifactStore: IArtifactStore;
  schedulerService: IScheduler;
  escalationService: IEscalationService;
  endpointTrustService: IEndpointTrustService;
  registryService: IRegistryService;
  appInstallService: IAppInstallService;
  appSettingsService: IAppSettingsService;
  packageInstallService: IPackageInstallService;
  nudgeDiscoveryService: INudgeDiscoveryService;
  voiceControlService: IVoiceControlService;
  publicMcpGatewayService: IPublicMcpGatewayService;
  publicMcpExecutionBridge: IPublicMcpExecutionBridge;
  appRuntimeService: IAppRuntimeService;
  panelTranspiler: PanelTranspiler;
  credentialVaultService: ICredentialVaultService;
  providerRegistry: ProviderRegistry;
  dataDir: string;
  /** MAO events emitted by coding agent runs. */
  codingAgentMaoEvents: Array<{ type: string; data: unknown; timestamp: string }>;
  /** In-memory store for agent sessions (keyed by session ID). */
  agentSessions: Map<string, AgentSessionEntry>;
}
