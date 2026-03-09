/**
 * Project API interface contracts for package-to-runtime mediation.
 *
 * Phase 7.2: Canonical seven-surface package API contract.
 */
import type {
  ArtifactDeleteRequest,
  ArtifactListFilter,
  ArtifactReadRequest,
  ArtifactReadResult,
  ArtifactVersionRecord,
  ArtifactWriteRequest,
  ArtifactWriteResult,
  EscalationChannel,
  EscalationContract,
  EscalationId,
  EscalationResponse,
  MemoryEntry,
  MemoryEntryId,
  MemoryScope,
  MemoryWriteCandidate,
  ModelResponse,
  ModelRole,
  ModelStreamChunk,
  ProjectConfig,
  ProjectState,
  RetrievalResult,
  ScheduleDefinition,
  ToolDefinition,
  ToolResult,
} from '../types/index.js';
import type { NousEvent } from '../events/index.js';

export interface IProjectApiMemory {
  read(query: string, scope: MemoryScope): Promise<MemoryEntry[]>;
  write(candidate: MemoryWriteCandidate): Promise<MemoryEntryId | null>;
  retrieve(situation: string, budget: number): Promise<RetrievalResult[]>;
}

export interface IProjectApiModel {
  invoke(role: ModelRole, input: unknown): Promise<ModelResponse>;
  stream(role: ModelRole, input: unknown): AsyncIterable<ModelStreamChunk>;
}

export interface IProjectApiTool {
  execute(name: string, params: unknown): Promise<ToolResult>;
  list(capabilities?: string[]): Promise<ToolDefinition[]>;
}

export interface IProjectApiArtifact {
  store(data: Omit<ArtifactWriteRequest, 'projectId'>): Promise<ArtifactWriteResult>;
  retrieve(
    request: Omit<ArtifactReadRequest, 'projectId'>,
  ): Promise<ArtifactReadResult | null>;
  list(filters?: ArtifactListFilter): Promise<ArtifactVersionRecord[]>;
  delete(request: Omit<ArtifactDeleteRequest, 'projectId'>): Promise<boolean>;
}

export interface IProjectApiEscalation {
  notify(channel: EscalationChannel, message: string): Promise<EscalationId>;
  request(decision: EscalationContract): Promise<EscalationResponse>;
}

export interface IProjectApiScheduler {
  register(schedule: ScheduleDefinition): Promise<string>;
  cancel(id: string): Promise<boolean>;
}

export interface IProjectApiProject {
  config(): ProjectConfig;
  state(): ProjectState;
  log(event: NousEvent): void;
}

export interface IProjectApi {
  memory: IProjectApiMemory;
  model: IProjectApiModel;
  tool: IProjectApiTool;
  artifact: IProjectApiArtifact;
  escalation: IProjectApiEscalation;
  scheduler: IProjectApiScheduler;
  project: IProjectApiProject;
}
