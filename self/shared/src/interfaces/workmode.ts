/**
 * Workmode interface contracts for Nous-OSS.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import type {
  WorkmodeContract,
  WorkmodeId,
  LeaseContract,
  LeaseId,
  AdmissionResult,
  ProjectControlState,
  ConfirmationProof,
  LifecycleAction,
} from '../types/index.js';

/** Canonical authority chain actors. */
export type AuthorityActor = 'nous_cortex' | 'orchestration_agent' | 'worker_agent';

/** Re-export for convenience */
export type { LifecycleAction };

/** Execution context for scope guard validation. */
export interface ScopeGuardExecutionContext {
  /** Node definition ID, if executing a specific workflow node */
  nodeDefinitionId?: string;
  /** Active workmode ID */
  workmodeId?: string;
  /** Emitter agent class for provenance validation */
  agentClass?: string;
}

/** Input for dispatch admission evaluation. */
export interface DispatchAdmissionInput {
  /** Actor initiating the dispatch (source of authority) */
  sourceActor: AuthorityActor;
  /** Target actor being dispatched to */
  targetActor: AuthorityActor;
  /** Action being dispatched (e.g. execute_subphase, etc.) */
  action: string;
  /** Optional project run ID for lease validation */
  projectRunId?: string;
  /** Optional workmode ID for context */
  workmodeId?: WorkmodeId;
  /** Optional execution context for scope guard validation */
  executionContext?: ScopeGuardExecutionContext;
}

/** Input for lifecycle admission evaluation. */
export interface LifecycleAdmissionInput {
  action: LifecycleAction;
  projectId: string;
  /** Current project control state */
  controlState: ProjectControlState | undefined;
  /** Confirmation proof (required per ADR-004) */
  confirmationProof?: ConfirmationProof;
}

/**
 * Registers and resolves workmode contracts.
 * Validates workmode_id, entrypoint_ref, sop_ref at activation.
 */
export interface IWorkmodeRegistry {
  /** Register a workmode contract */
  register(contract: WorkmodeContract): void;

  /** Get workmode contract by ID, or null if unknown */
  get(workmodeId: WorkmodeId): WorkmodeContract | null;

  /** List all registered workmode IDs */
  list(): WorkmodeId[];
}

/**
 * Stores and retrieves active leases.
 * Validates lease validity (TTL, revocation) before orchestration_agent execution.
 */
export interface ILeaseStore {
  /** Store a lease */
  store(lease: LeaseContract): void;

  /** Get active lease for project run (non-expired, non-revoked) */
  getActive(projectRunId: string): LeaseContract | null;

  /** Revoke a lease by ID */
  revoke(leaseId: LeaseId): void;

  /** Remove expired leases (cleanup) */
  pruneExpired(): void;
}

/**
 * Validates dispatch admission (target identity, action admissibility, authority-chain narrowing).
 * Called before every worker dispatch.
 */
export interface IWorkmodeAdmissionGuard {
  /** Evaluate whether a dispatch is permitted */
  evaluateDispatchAdmission(input: DispatchAdmissionInput): AdmissionResult;

  /** Evaluate whether a lifecycle action is permitted */
  evaluateLifecycleAdmission(input: LifecycleAdmissionInput): AdmissionResult;

  /** Evaluate scope guard admissibility (optional — concrete class provides implementation) */
  evaluateScopeGuard?(input: DispatchAdmissionInput): AdmissionResult;
}
