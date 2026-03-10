/**
 * @nous/subcortex-artifacts — Integrity-verified artifact persistence and retrieval.
 */
export {
  buildArtifactRef,
  computeIntegrityRef,
  decodeArtifactData,
  encodeArtifactData,
  type EncodedArtifactData,
} from './integrity.js';
export {
  DocumentArtifactStore,
  ARTIFACT_MANIFEST_COLLECTION,
  ARTIFACT_PAYLOAD_COLLECTION,
  type DocumentArtifactStoreOptions,
} from './document-artifact-store.js';
