import { describe, it, expect } from 'vitest';
import {
  ProjectIdSchema,
  MemoryEntryIdSchema,
  NodeIdSchema,
  TraceIdSchema,
  ArtifactIdSchema,
  ProviderIdSchema,
  WorkflowExecutionIdSchema,
  WorkflowDefinitionIdSchema,
  WorkflowNodeDefinitionIdSchema,
  WorkflowEdgeIdSchema,
  WorkflowNodeRunIdSchema,
  WorkflowDispatchLineageIdSchema,
  EscalationIdSchema,
  WitnessEventIdSchema,
  WitnessCheckpointIdSchema,
  VerificationReportIdSchema,
  AttestationReceiptIdSchema,
  LeaseIdSchema,
} from '../../types/ids.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const schemas = [
  { name: 'ProjectIdSchema', schema: ProjectIdSchema },
  { name: 'MemoryEntryIdSchema', schema: MemoryEntryIdSchema },
  { name: 'NodeIdSchema', schema: NodeIdSchema },
  { name: 'TraceIdSchema', schema: TraceIdSchema },
  { name: 'ArtifactIdSchema', schema: ArtifactIdSchema },
  { name: 'ProviderIdSchema', schema: ProviderIdSchema },
  { name: 'WorkflowExecutionIdSchema', schema: WorkflowExecutionIdSchema },
  { name: 'WorkflowDefinitionIdSchema', schema: WorkflowDefinitionIdSchema },
  { name: 'WorkflowNodeDefinitionIdSchema', schema: WorkflowNodeDefinitionIdSchema },
  { name: 'WorkflowEdgeIdSchema', schema: WorkflowEdgeIdSchema },
  { name: 'WorkflowNodeRunIdSchema', schema: WorkflowNodeRunIdSchema },
  {
    name: 'WorkflowDispatchLineageIdSchema',
    schema: WorkflowDispatchLineageIdSchema,
  },
  { name: 'EscalationIdSchema', schema: EscalationIdSchema },
  { name: 'WitnessEventIdSchema', schema: WitnessEventIdSchema },
  { name: 'WitnessCheckpointIdSchema', schema: WitnessCheckpointIdSchema },
  { name: 'VerificationReportIdSchema', schema: VerificationReportIdSchema },
  { name: 'AttestationReceiptIdSchema', schema: AttestationReceiptIdSchema },
  { name: 'LeaseIdSchema', schema: LeaseIdSchema },
];

describe.each(schemas)('$name', ({ schema }) => {
  it('accepts a valid UUID', () => {
    expect(schema.safeParse(VALID_UUID).success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(schema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(schema.safeParse('').success).toBe(false);
  });

  it('rejects a number', () => {
    expect(schema.safeParse(123).success).toBe(false);
  });

  it('rejects null', () => {
    expect(schema.safeParse(null).success).toBe(false);
  });
});
