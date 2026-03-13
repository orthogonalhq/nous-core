/**
 * NousContext — server-side context for tRPC procedures.
 *
 * Holds the wired Nous stack: core executor, stores, config, etc.
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
  IVoiceControlService,
} from '@nous/shared';
import type { IPrincipalSystemGatewayRuntime } from '@nous/cortex-core';
import type { MwcPipeline } from '@nous/memory-mwc';
import type { IDocumentStore } from '@nous/shared';
import type { IModelRouter } from '@nous/shared';
import type { IConfig } from '@nous/shared';
import type { ProviderId } from '@nous/shared';
import type { IModelProvider } from '@nous/shared';

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
  nudgeDiscoveryService: INudgeDiscoveryService;
  voiceControlService: IVoiceControlService;
  dataDir: string;
}
