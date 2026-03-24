/**
 * Declarative workflow specification — parser, serializer, and runtime adapter.
 */
export {
  parseWorkflowSpec,
  type ParseWorkflowSpecResult,
  type ParseWorkflowSpecSuccess,
  type ParseWorkflowSpecFailure,
} from './parser.js';
export {
  serializeWorkflowSpec,
  type SerializeWorkflowSpecOptions,
} from './serializer.js';
export {
  parseJsonWorkflowSpec,
  serializeJsonWorkflowSpec,
  type ParseJsonWorkflowSpecResult,
  type ParseJsonWorkflowSpecSuccess,
  type ParseJsonWorkflowSpecFailure,
} from './json-stub.js';
export {
  specToWorkflowDefinition,
  specToExecutionGraph,
  buildNodeIdMap,
  type NodeEnrichmentData,
  type SpecToDefinitionOptions,
} from './runtime-adapter.js';
