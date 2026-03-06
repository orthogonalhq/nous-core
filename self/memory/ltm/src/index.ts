/**
 * @nous/memory-ltm — Document-backed long-term memory runtime.
 */
export {
  DocumentLtmStore,
  MEMORY_ENTRY_COLLECTION,
  MEMORY_MUTATION_AUDIT_COLLECTION,
  MEMORY_TOMBSTONE_COLLECTION,
  type DocumentLtmStoreOptions,
  type AppendAuditRecordInput,
} from './document-ltm-store.js';
export {
  GovernedTypedLtmRuntime,
  TypedLtmWriteCandidateSchema,
  TypedLtmEntrySchema,
  type TypedLtmMemoryType,
  type TypedLtmWriteCandidate,
  type TypedLtmEntry,
  type GovernedTypedLtmRuntimeOptions,
  type GovernedTypedLtmPolicyOptions,
  type GovernedTypedLtmMutationGuard,
  type GovernedTypedLtmWriteInput,
  type GovernedTypedLtmWriteDecision,
  type GovernedTypedLtmMutationResult,
  type LtmVectorIndexingOptions,
} from './governed-typed-ltm-runtime.js';
