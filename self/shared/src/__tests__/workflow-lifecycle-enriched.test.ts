/**
 * Tier 1 — Contract tests for enriched WorkflowLifecycleInstanceSummarySchema.
 *
 * Verifies backward compatibility (new fields default to []),
 * enriched field preservation, and strict-mode behavior.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import {
  WorkflowLifecycleInstanceSummarySchema,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validBaseInstanceSummary() {
  return {
    runId: randomUUID(),
    projectId: randomUUID(),
    workflowDefinitionId: randomUUID(),
    definitionName: 'test-workflow',
    status: 'running' as const,
    activeNodeIds: [],
    waitingNodeIds: [],
    blockedNodeIds: [],
    checkpointState: 'idle' as const,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Backward compatibility — new fields default to []
// ---------------------------------------------------------------------------

describe('WorkflowLifecycleInstanceSummarySchema — backward compatibility', () => {
  it('defaults readyNodeIds to [] when not provided', () => {
    const result = WorkflowLifecycleInstanceSummarySchema.parse(
      validBaseInstanceSummary(),
    );
    expect(result.readyNodeIds).toEqual([]);
  });

  it('defaults readyNodeDispatchMetadata to [] when not provided', () => {
    const result = WorkflowLifecycleInstanceSummarySchema.parse(
      validBaseInstanceSummary(),
    );
    expect(result.readyNodeDispatchMetadata).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Enriched fields preserved
// ---------------------------------------------------------------------------

describe('WorkflowLifecycleInstanceSummarySchema — enriched fields', () => {
  it('preserves populated readyNodeIds', () => {
    const nodeId1 = randomUUID();
    const nodeId2 = randomUUID();
    const result = WorkflowLifecycleInstanceSummarySchema.parse({
      ...validBaseInstanceSummary(),
      readyNodeIds: [nodeId1, nodeId2],
    });
    expect(result.readyNodeIds).toEqual([nodeId1, nodeId2]);
  });

  it('preserves populated readyNodeDispatchMetadata', () => {
    const metadata = [
      {
        nodeDefinitionId: randomUUID(),
        nodeType: 'model-call',
        nodeName: 'Claude Agent',
        executionMode: 'dispatched',
        agentClass: 'Worker',
        dispatchLineageId: randomUUID(),
      },
      {
        nodeDefinitionId: randomUUID(),
        nodeType: 'condition',
        nodeName: 'Check Result',
        executionMode: 'internal',
        agentClass: null,
      },
    ];
    const result = WorkflowLifecycleInstanceSummarySchema.parse({
      ...validBaseInstanceSummary(),
      readyNodeIds: [metadata[0]!.nodeDefinitionId, metadata[1]!.nodeDefinitionId],
      readyNodeDispatchMetadata: metadata,
    });
    expect(result.readyNodeDispatchMetadata).toHaveLength(2);
    expect(result.readyNodeDispatchMetadata[0]!.nodeType).toBe('model-call');
    expect(result.readyNodeDispatchMetadata[0]!.executionMode).toBe('dispatched');
    expect(result.readyNodeDispatchMetadata[1]!.nodeType).toBe('condition');
    expect(result.readyNodeDispatchMetadata[1]!.executionMode).toBe('internal');
  });
});

// ---------------------------------------------------------------------------
// Strict mode — unknown fields still rejected
// ---------------------------------------------------------------------------

describe('WorkflowLifecycleInstanceSummarySchema — strict mode', () => {
  it('rejects unknown fields', () => {
    expect(() =>
      WorkflowLifecycleInstanceSummarySchema.parse({
        ...validBaseInstanceSummary(),
        unknownField: 'bad',
      }),
    ).toThrow(ZodError);
  });

  it('accepts valid objects with all known fields', () => {
    const result = WorkflowLifecycleInstanceSummarySchema.parse({
      ...validBaseInstanceSummary(),
      readyNodeIds: [],
      readyNodeDispatchMetadata: [],
    });
    expect(result).toBeDefined();
  });
});
