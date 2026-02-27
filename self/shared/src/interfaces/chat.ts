/**
 * Chat control-plane interfaces for Nous-OSS.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Canonical source: project-chat-pfc-control-plane-canonical-architecture-v1.md
 */
import type {
  ChatTurnEnvelope,
  ChatIntentClass,
  ProjectChatThread,
  ChatThreadBindCommand,
  ScopeResolutionResult,
} from '../types/index.js';
import type { ControlCommandEnvelope, ConfirmationProof } from '../types/opctl.js';
import type { ProjectId } from '../types/ids.js';

/** Resolves project_id and active run context from chat turn. Blocks when control state blocks dispatch. */
export interface IChatScopeResolver {
  resolve(
    envelope: ChatTurnEnvelope,
    requiresExecutableScope: boolean,
  ): Promise<ScopeResolutionResult>;
}

/** Classifies turn into intent class. Returns confidence; below-threshold yields ambiguous. */
export interface IChatIntentClassifier {
  classify(
    envelope: ChatTurnEnvelope,
    scopeResolved: boolean,
  ): Promise<{ intent: ChatIntentClass; confidence: number }>;
}

/** Routes control_intent to operator-control. Validates thread; blocks from scratch. */
export interface IChatControlRouter {
  routeControlIntent(
    turnEnvelope: ChatTurnEnvelope,
    thread: ProjectChatThread,
    commandEnvelope: ControlCommandEnvelope,
    confirmationProof?: ConfirmationProof,
  ): Promise<{ allowed: boolean; reasonCode?: string; evidenceRefs?: string[] }>;
}

/** Stores and retrieves project chat threads. Enforces scratch non-executable. */
export interface IChatThreadStore {
  get(threadId: string): Promise<ProjectChatThread | null>;
  getByProject(projectId: ProjectId): Promise<ProjectChatThread[]>;
  store(thread: ProjectChatThread): Promise<void>;
  update(thread: ProjectChatThread): Promise<void>;
}

/** Evaluates thread bind commands. Blocks implicit binding and silent scratch-to-executable. */
export interface IChatThreadBindGuard {
  evaluateBind(
    command: ChatThreadBindCommand,
    currentThread: ProjectChatThread,
  ): Promise<{ allowed: boolean; reasonCode?: string; evidenceRefs?: string[] }>;
}
