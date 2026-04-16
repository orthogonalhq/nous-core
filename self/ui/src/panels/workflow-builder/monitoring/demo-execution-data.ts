import type { ExecutionRun, GateState, ArtifactRef } from '../../../types/workflow-builder'

/**
 * Demo execution runs for the Execution Monitor and History panels.
 *
 * Provides 3 runs with varied states:
 * - Run 1: completed — all nodes completed, all edges completed
 * - Run 2: running — some nodes running/pending, edges active/idle
 * - Run 3: failed — one node failed, downstream nodes skipped
 */

export const DEMO_EXECUTION_RUNS: ExecutionRun[] = [
  // ─── Run 1: Completed ────────────────────────────────────────────────────────
  {
    id: 'run-001',
    workflowId: 'demo-workflow',
    status: 'completed',
    startedAt: '2026-03-26T03:00:00Z',
    completedAt: '2026-03-26T03:00:12Z',
    nodeStates: {
      'node-1': { nodeId: 'node-1', status: 'completed', startedAt: '2026-03-26T03:00:00Z', completedAt: '2026-03-26T03:00:01Z', duration: 1000, error: null },
      'node-2': { nodeId: 'node-2', status: 'completed', startedAt: '2026-03-26T03:00:01Z', completedAt: '2026-03-26T03:00:04Z', duration: 3000, error: null },
      'node-3': { nodeId: 'node-3', status: 'completed', startedAt: '2026-03-26T03:00:04Z', completedAt: '2026-03-26T03:00:05Z', duration: 500, error: null },
      'node-4': { nodeId: 'node-4', status: 'skipped', startedAt: null, completedAt: null, duration: null, error: null },
      'node-5': { nodeId: 'node-5', status: 'completed', startedAt: '2026-03-26T03:00:05Z', completedAt: '2026-03-26T03:00:08Z', duration: 3200, error: null },
      'node-6': { nodeId: 'node-6', status: 'completed', startedAt: '2026-03-26T03:00:08Z', completedAt: '2026-03-26T03:00:10Z', duration: 1800, error: null },
      'node-7': { nodeId: 'node-7', status: 'skipped', startedAt: null, completedAt: null, duration: null, error: null },
    },
    edgeStates: {
      'edge-1': { edgeId: 'edge-1', status: 'completed', flowType: 'execution' },
      'edge-2': { edgeId: 'edge-2', status: 'completed', flowType: 'execution' },
      'edge-3': { edgeId: 'edge-3', status: 'idle', flowType: 'execution' },
      'edge-4': { edgeId: 'edge-4', status: 'completed', flowType: 'execution' },
      'edge-5': { edgeId: 'edge-5', status: 'completed', flowType: 'execution' },
      'edge-6': { edgeId: 'edge-6', status: 'idle', flowType: 'execution' },
      'edge-7': { edgeId: 'edge-7', status: 'completed', flowType: 'config' },
      'edge-8': { edgeId: 'edge-8', status: 'completed', flowType: 'memory' },
    },
    events: [
      { id: 'evt-001', type: 'run_started', timestamp: '2026-03-26T03:00:00Z', nodeId: null, edgeId: null, metadata: {} },
      { id: 'evt-002', type: 'node_started', timestamp: '2026-03-26T03:00:00Z', nodeId: 'node-1', edgeId: null, metadata: {} },
      { id: 'evt-003', type: 'node_completed', timestamp: '2026-03-26T03:00:01Z', nodeId: 'node-1', edgeId: null, metadata: {} },
      { id: 'evt-004', type: 'edge_activated', timestamp: '2026-03-26T03:00:01Z', nodeId: null, edgeId: 'edge-1', metadata: {} },
      { id: 'evt-005', type: 'node_started', timestamp: '2026-03-26T03:00:01Z', nodeId: 'node-2', edgeId: null, metadata: {} },
      { id: 'evt-006', type: 'node_completed', timestamp: '2026-03-26T03:00:04Z', nodeId: 'node-2', edgeId: null, metadata: {} },
      { id: 'evt-007', type: 'node_started', timestamp: '2026-03-26T03:00:04Z', nodeId: 'node-3', edgeId: null, metadata: {} },
      { id: 'evt-008', type: 'node_completed', timestamp: '2026-03-26T03:00:05Z', nodeId: 'node-3', edgeId: null, metadata: {} },
      { id: 'evt-009', type: 'node_skipped', timestamp: '2026-03-26T03:00:05Z', nodeId: 'node-4', edgeId: null, metadata: { reason: 'condition false' } },
      { id: 'evt-010', type: 'node_started', timestamp: '2026-03-26T03:00:05Z', nodeId: 'node-5', edgeId: null, metadata: {} },
      { id: 'evt-011', type: 'node_completed', timestamp: '2026-03-26T03:00:08Z', nodeId: 'node-5', edgeId: null, metadata: {} },
      { id: 'evt-012', type: 'node_started', timestamp: '2026-03-26T03:00:08Z', nodeId: 'node-6', edgeId: null, metadata: {} },
      { id: 'evt-013', type: 'node_completed', timestamp: '2026-03-26T03:00:10Z', nodeId: 'node-6', edgeId: null, metadata: {} },
      { id: 'evt-014', type: 'run_completed', timestamp: '2026-03-26T03:00:12Z', nodeId: null, edgeId: null, metadata: {} },
    ],
    gateStates: {
      'node-1': [
        { gateId: 'g-101', name: 'Input validation', status: 'passed', nodeId: 'node-1', type: 'quality', errorDetail: null },
        { gateId: 'g-102', name: 'Rate limit check', status: 'passed', nodeId: 'node-1', type: 'quality', errorDetail: null },
      ],
      'node-2': [
        { gateId: 'g-103', name: 'Schema conformance', status: 'passed', nodeId: 'node-2', type: 'quality', errorDetail: null },
        { gateId: 'g-104', name: 'Reviewer approval', status: 'passed', nodeId: 'node-2', type: 'approval', errorDetail: null },
      ],
      'node-3': [
        { gateId: 'g-105', name: 'Output format check', status: 'passed', nodeId: 'node-3', type: 'quality', errorDetail: null },
      ],
      'node-5': [
        { gateId: 'g-106', name: 'Policy compliance', status: 'passed', nodeId: 'node-5', type: 'governance', errorDetail: null },
      ],
    },
    artifactRefs: {
      'node-1': [
        { id: 'art-101', type: 'webhook payload', label: 'Inbound webhook payload', nodeId: 'node-1', artifactType: 'output' },
      ],
      'node-2': [
        { id: 'art-102', type: 'dispatch packet', label: 'Agent dispatch to node-3', nodeId: 'node-2', artifactType: 'dispatch' },
        { id: 'art-103', type: 'processed result', label: 'Analysis output', nodeId: 'node-2', artifactType: 'output' },
      ],
      'node-3': [
        { id: 'art-104', type: 'dispatch packet', label: 'Condition routing packet', nodeId: 'node-3', artifactType: 'dispatch' },
      ],
      'node-5': [
        { id: 'art-105', type: 'revision record', label: 'Governance revision v1', nodeId: 'node-5', artifactType: 'revision' },
      ],
      'node-6': [
        { id: 'art-106', type: 'escalation notice', label: 'Low-priority alert', nodeId: 'node-6', artifactType: 'escalation' },
      ],
    },
  },

  // ─── Run 2: Running ──────────────────────────────────────────────────────────
  {
    id: 'run-002',
    workflowId: 'demo-workflow',
    status: 'running',
    startedAt: '2026-03-26T04:30:00Z',
    completedAt: null,
    nodeStates: {
      'node-1': { nodeId: 'node-1', status: 'completed', startedAt: '2026-03-26T04:30:00Z', completedAt: '2026-03-26T04:30:01Z', duration: 800, error: null },
      'node-2': { nodeId: 'node-2', status: 'running', startedAt: '2026-03-26T04:30:01Z', completedAt: null, duration: null, error: null },
      'node-3': { nodeId: 'node-3', status: 'pending', startedAt: null, completedAt: null, duration: null, error: null },
      'node-4': { nodeId: 'node-4', status: 'pending', startedAt: null, completedAt: null, duration: null, error: null },
      'node-5': { nodeId: 'node-5', status: 'pending', startedAt: null, completedAt: null, duration: null, error: null },
      'node-6': { nodeId: 'node-6', status: 'pending', startedAt: null, completedAt: null, duration: null, error: null },
      'node-7': { nodeId: 'node-7', status: 'pending', startedAt: null, completedAt: null, duration: null, error: null },
    },
    edgeStates: {
      'edge-1': { edgeId: 'edge-1', status: 'completed', flowType: 'execution' },
      'edge-2': { edgeId: 'edge-2', status: 'active', flowType: 'execution' },
      'edge-3': { edgeId: 'edge-3', status: 'idle', flowType: 'execution' },
      'edge-4': { edgeId: 'edge-4', status: 'idle', flowType: 'execution' },
      'edge-5': { edgeId: 'edge-5', status: 'idle', flowType: 'execution' },
      'edge-6': { edgeId: 'edge-6', status: 'idle', flowType: 'execution' },
      'edge-7': { edgeId: 'edge-7', status: 'active', flowType: 'config' },
      'edge-8': { edgeId: 'edge-8', status: 'idle', flowType: 'memory' },
    },
    events: [
      { id: 'evt-020', type: 'run_started', timestamp: '2026-03-26T04:30:00Z', nodeId: null, edgeId: null, metadata: {} },
      { id: 'evt-021', type: 'node_started', timestamp: '2026-03-26T04:30:00Z', nodeId: 'node-1', edgeId: null, metadata: {} },
      { id: 'evt-022', type: 'node_completed', timestamp: '2026-03-26T04:30:01Z', nodeId: 'node-1', edgeId: null, metadata: {} },
      { id: 'evt-023', type: 'edge_activated', timestamp: '2026-03-26T04:30:01Z', nodeId: null, edgeId: 'edge-1', metadata: {} },
      { id: 'evt-024', type: 'node_started', timestamp: '2026-03-26T04:30:01Z', nodeId: 'node-2', edgeId: null, metadata: {} },
    ],
    gateStates: {
      'node-1': [
        { gateId: 'g-201', name: 'Input validation', status: 'passed', nodeId: 'node-1', type: 'quality', errorDetail: null },
      ],
      'node-2': [
        { gateId: 'g-202', name: 'Schema conformance', status: 'pending', nodeId: 'node-2', type: 'quality', errorDetail: null },
        { gateId: 'g-203', name: 'Reviewer approval', status: 'pending', nodeId: 'node-2', type: 'approval', errorDetail: null },
      ],
    },
    artifactRefs: {
      'node-1': [
        { id: 'art-201', type: 'webhook payload', label: 'Inbound webhook payload', nodeId: 'node-1', artifactType: 'output' },
      ],
    },
  },

  // ─── Run 3: Failed ───────────────────────────────────────────────────────────
  {
    id: 'run-003',
    workflowId: 'demo-workflow',
    status: 'failed',
    startedAt: '2026-03-26T02:00:00Z',
    completedAt: '2026-03-26T02:00:07Z',
    nodeStates: {
      'node-1': { nodeId: 'node-1', status: 'completed', startedAt: '2026-03-26T02:00:00Z', completedAt: '2026-03-26T02:00:01Z', duration: 950, error: null },
      'node-2': { nodeId: 'node-2', status: 'completed', startedAt: '2026-03-26T02:00:01Z', completedAt: '2026-03-26T02:00:04Z', duration: 2800, error: null },
      'node-3': { nodeId: 'node-3', status: 'completed', startedAt: '2026-03-26T02:00:04Z', completedAt: '2026-03-26T02:00:05Z', duration: 400, error: null },
      'node-4': { nodeId: 'node-4', status: 'failed', startedAt: '2026-03-26T02:00:05Z', completedAt: '2026-03-26T02:00:07Z', duration: 2000, error: 'Slack API rate limit exceeded' },
      'node-5': { nodeId: 'node-5', status: 'skipped', startedAt: null, completedAt: null, duration: null, error: null },
      'node-6': { nodeId: 'node-6', status: 'skipped', startedAt: null, completedAt: null, duration: null, error: null },
      'node-7': { nodeId: 'node-7', status: 'skipped', startedAt: null, completedAt: null, duration: null, error: null },
    },
    edgeStates: {
      'edge-1': { edgeId: 'edge-1', status: 'completed', flowType: 'execution' },
      'edge-2': { edgeId: 'edge-2', status: 'completed', flowType: 'execution' },
      'edge-3': { edgeId: 'edge-3', status: 'completed', flowType: 'execution' },
      'edge-4': { edgeId: 'edge-4', status: 'idle', flowType: 'execution' },
      'edge-5': { edgeId: 'edge-5', status: 'idle', flowType: 'execution' },
      'edge-6': { edgeId: 'edge-6', status: 'idle', flowType: 'execution' },
      'edge-7': { edgeId: 'edge-7', status: 'completed', flowType: 'config' },
      'edge-8': { edgeId: 'edge-8', status: 'idle', flowType: 'memory' },
    },
    events: [
      { id: 'evt-030', type: 'run_started', timestamp: '2026-03-26T02:00:00Z', nodeId: null, edgeId: null, metadata: {} },
      { id: 'evt-031', type: 'node_started', timestamp: '2026-03-26T02:00:00Z', nodeId: 'node-1', edgeId: null, metadata: {} },
      { id: 'evt-032', type: 'node_completed', timestamp: '2026-03-26T02:00:01Z', nodeId: 'node-1', edgeId: null, metadata: {} },
      { id: 'evt-033', type: 'node_started', timestamp: '2026-03-26T02:00:01Z', nodeId: 'node-2', edgeId: null, metadata: {} },
      { id: 'evt-034', type: 'node_completed', timestamp: '2026-03-26T02:00:04Z', nodeId: 'node-2', edgeId: null, metadata: {} },
      { id: 'evt-035', type: 'node_started', timestamp: '2026-03-26T02:00:04Z', nodeId: 'node-3', edgeId: null, metadata: {} },
      { id: 'evt-036', type: 'node_completed', timestamp: '2026-03-26T02:00:05Z', nodeId: 'node-3', edgeId: null, metadata: {} },
      { id: 'evt-037', type: 'node_started', timestamp: '2026-03-26T02:00:05Z', nodeId: 'node-4', edgeId: null, metadata: {} },
      { id: 'evt-038', type: 'node_failed', timestamp: '2026-03-26T02:00:07Z', nodeId: 'node-4', edgeId: null, metadata: { error: 'Slack API rate limit exceeded' } },
      { id: 'evt-039', type: 'node_skipped', timestamp: '2026-03-26T02:00:07Z', nodeId: 'node-5', edgeId: null, metadata: { reason: 'upstream failure' } },
      { id: 'evt-040', type: 'node_skipped', timestamp: '2026-03-26T02:00:07Z', nodeId: 'node-6', edgeId: null, metadata: { reason: 'upstream failure' } },
      { id: 'evt-041', type: 'node_skipped', timestamp: '2026-03-26T02:00:07Z', nodeId: 'node-7', edgeId: null, metadata: { reason: 'upstream failure' } },
      { id: 'evt-042', type: 'run_failed', timestamp: '2026-03-26T02:00:07Z', nodeId: null, edgeId: null, metadata: { reason: 'Node node-4 failed' } },
    ],
    gateStates: {
      'node-1': [
        { gateId: 'g-301', name: 'Input validation', status: 'passed', nodeId: 'node-1', type: 'quality', errorDetail: null },
      ],
      'node-2': [
        { gateId: 'g-302', name: 'Schema conformance', status: 'passed', nodeId: 'node-2', type: 'quality', errorDetail: null },
        { gateId: 'g-303', name: 'Reviewer approval', status: 'passed', nodeId: 'node-2', type: 'approval', errorDetail: null },
      ],
      'node-3': [
        { gateId: 'g-304', name: 'Output format check', status: 'passed', nodeId: 'node-3', type: 'quality', errorDetail: null },
      ],
      'node-4': [
        { gateId: 'g-305', name: 'API response validation', status: 'failed', nodeId: 'node-4', type: 'quality', errorDetail: 'Output schema validation failed: missing required field "confidence_score"' },
      ],
    },
    artifactRefs: {
      'node-1': [
        { id: 'art-301', type: 'webhook payload', label: 'Inbound webhook payload', nodeId: 'node-1', artifactType: 'output' },
      ],
      'node-2': [
        { id: 'art-302', type: 'dispatch packet', label: 'Agent dispatch to node-3', nodeId: 'node-2', artifactType: 'dispatch' },
      ],
    },
  },
]
