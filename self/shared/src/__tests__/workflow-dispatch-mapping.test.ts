/**
 * Tier 1 — Contract tests for dispatch mapping types, constant, and schemas.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  WORKFLOW_NODE_DISPATCH_MAP,
  WorkflowNodeDispatchMappingSchema,
  WorkflowNodeDispatchMetadataSchema,
  WorkflowNodeKindSchema,
  type WorkflowNodeKind,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// All 7 WorkflowNodeKind values (6 from NodeTypeSchema + 'subworkflow')
// ---------------------------------------------------------------------------

const ALL_NODE_KINDS: WorkflowNodeKind[] = [
  'model-call',
  'tool-execution',
  'subworkflow',
  'condition',
  'transform',
  'quality-gate',
  'human-decision',
];

// ---------------------------------------------------------------------------
// WORKFLOW_NODE_DISPATCH_MAP — exhaustiveness and correctness
// ---------------------------------------------------------------------------

describe('WORKFLOW_NODE_DISPATCH_MAP', () => {
  it('has an entry for every WorkflowNodeKind value', () => {
    for (const kind of ALL_NODE_KINDS) {
      expect(WORKFLOW_NODE_DISPATCH_MAP).toHaveProperty(kind);
    }
  });

  it('has exactly 7 entries (one per kind)', () => {
    expect(Object.keys(WORKFLOW_NODE_DISPATCH_MAP)).toHaveLength(7);
  });

  it.each([
    ['model-call', 'dispatched', 'Worker'],
    ['tool-execution', 'dispatched', 'Worker'],
    ['subworkflow', 'dispatched', 'Orchestrator'],
    ['condition', 'internal', null],
    ['transform', 'internal', null],
    ['quality-gate', 'internal', null],
    ['human-decision', 'internal', null],
  ] as const)(
    'maps %s to executionMode=%s, agentClass=%s',
    (kind, expectedMode, expectedClass) => {
      const entry = WORKFLOW_NODE_DISPATCH_MAP[kind];
      expect(entry.executionMode).toBe(expectedMode);
      expect(entry.agentClass).toBe(expectedClass);
    },
  );
});

// ---------------------------------------------------------------------------
// WorkflowNodeDispatchMappingSchema — validation
// ---------------------------------------------------------------------------

describe('WorkflowNodeDispatchMappingSchema', () => {
  it('accepts a valid internal mapping', () => {
    const result = WorkflowNodeDispatchMappingSchema.parse({
      executionMode: 'internal',
      agentClass: null,
    });
    expect(result.executionMode).toBe('internal');
    expect(result.agentClass).toBeNull();
  });

  it('accepts a valid dispatched mapping', () => {
    const result = WorkflowNodeDispatchMappingSchema.parse({
      executionMode: 'dispatched',
      agentClass: 'Worker',
    });
    expect(result.executionMode).toBe('dispatched');
    expect(result.agentClass).toBe('Worker');
  });

  it('rejects an invalid executionMode', () => {
    expect(() =>
      WorkflowNodeDispatchMappingSchema.parse({
        executionMode: 'unknown',
        agentClass: 'Worker',
      }),
    ).toThrow();
  });

  it('rejects an invalid agentClass', () => {
    expect(() =>
      WorkflowNodeDispatchMappingSchema.parse({
        executionMode: 'dispatched',
        agentClass: 'InvalidAgent',
      }),
    ).toThrow();
  });

  it('rejects extra fields (strict mode)', () => {
    expect(() =>
      WorkflowNodeDispatchMappingSchema.parse({
        executionMode: 'internal',
        agentClass: null,
        extra: true,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// WorkflowNodeDispatchMetadataSchema — validation
// ---------------------------------------------------------------------------

describe('WorkflowNodeDispatchMetadataSchema', () => {
  const validMetadata = {
    nodeDefinitionId: randomUUID(),
    nodeType: 'model-call',
    nodeName: 'Test Node',
    executionMode: 'dispatched',
    agentClass: 'Worker',
    dispatchLineageId: randomUUID(),
  };

  it('accepts a fully-populated metadata object (with dispatchLineageId)', () => {
    const result = WorkflowNodeDispatchMetadataSchema.parse(validMetadata);
    expect(result.nodeDefinitionId).toBe(validMetadata.nodeDefinitionId);
    expect(result.nodeType).toBe('model-call');
    expect(result.nodeName).toBe('Test Node');
    expect(result.executionMode).toBe('dispatched');
    expect(result.agentClass).toBe('Worker');
    expect(result.dispatchLineageId).toBe(validMetadata.dispatchLineageId);
  });

  it('accepts metadata without dispatchLineageId', () => {
    const { dispatchLineageId: _, ...withoutLineage } = validMetadata;
    const result = WorkflowNodeDispatchMetadataSchema.parse(withoutLineage);
    expect(result.dispatchLineageId).toBeUndefined();
  });

  it('accepts metadata with internal execution mode and null agentClass', () => {
    const internalMetadata = {
      nodeDefinitionId: randomUUID(),
      nodeType: 'condition',
      nodeName: 'Check Value',
      executionMode: 'internal',
      agentClass: null,
    };
    const result = WorkflowNodeDispatchMetadataSchema.parse(internalMetadata);
    expect(result.executionMode).toBe('internal');
    expect(result.agentClass).toBeNull();
  });

  it('rejects metadata with empty nodeName', () => {
    expect(() =>
      WorkflowNodeDispatchMetadataSchema.parse({
        ...validMetadata,
        nodeName: '',
      }),
    ).toThrow();
  });

  it('rejects extra fields (strict mode)', () => {
    expect(() =>
      WorkflowNodeDispatchMetadataSchema.parse({
        ...validMetadata,
        extra: true,
      }),
    ).toThrow();
  });
});
