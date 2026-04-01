/**
 * Tests for the runtime adapter — specToWorkflowDefinition / specToExecutionGraph.
 */
import { describe, it, expect } from 'vitest';
import {
  specToWorkflowDefinition,
  specToExecutionGraph,
  mapNodeTypeToDispatchTarget,
} from '../runtime-adapter.js';
import type { WorkflowSpec, WorkflowNodeKind } from '@nous/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const linearSpec: WorkflowSpec = {
  name: 'Linear Workflow',
  version: 1,
  nodes: [
    {
      id: 'trigger',
      name: 'Schedule Trigger',
      type: 'nous.trigger.schedule',
      position: [0, 0],
      parameters: { cron: '0 * * * *' },
    },
    {
      id: 'agent',
      name: 'Claude Agent',
      type: 'nous.agent.claude',
      position: [200, 0],
      parameters: { model: 'claude-3-opus' },
    },
    {
      id: 'save',
      name: 'Save to Memory',
      type: 'nous.memory.write',
      position: [400, 0],
      parameters: { key: 'result' },
    },
  ],
  connections: [
    { from: 'trigger', to: 'agent' },
    { from: 'agent', to: 'save' },
  ],
};

const conditionalSpec: WorkflowSpec = {
  name: 'Conditional Workflow',
  version: 1,
  nodes: [
    {
      id: 'trigger',
      name: 'Webhook',
      type: 'nous.trigger.webhook',
      position: [0, 0],
      parameters: { path: '/decide' },
    },
    {
      id: 'check',
      name: 'Check Condition',
      type: 'nous.condition.if',
      position: [200, 0],
      parameters: { expression: 'data.score > 0.8' },
    },
    {
      id: 'accept',
      name: 'Accept',
      type: 'nous.agent.claude',
      position: [400, -100],
      parameters: {},
    },
    {
      id: 'reject',
      name: 'Reject',
      type: 'nous.agent.claude',
      position: [400, 100],
      parameters: {},
    },
  ],
  connections: [
    { from: 'trigger', to: 'check' },
    { from: 'check', to: 'accept', output: true },
    { from: 'check', to: 'reject', output: false },
  ],
};

const mixedTypesSpec: WorkflowSpec = {
  name: 'Mixed Types',
  version: 1,
  nodes: [
    {
      id: 'trigger',
      name: 'Trigger',
      type: 'nous.trigger.schedule',
      position: [0, 0],
      parameters: { cron: '0 9 * * *' },
    },
    {
      id: 'search',
      name: 'Search Memory',
      type: 'nous.memory.search',
      position: [200, 0],
      parameters: { query: 'recent tasks', limit: 10 },
    },
    {
      id: 'gate',
      name: 'Governance Gate',
      type: 'nous.governance.pfc-gate',
      position: [400, 0],
      parameters: { tier: 3 },
    },
    {
      id: 'agent',
      name: 'Agent',
      type: 'nous.agent.claude',
      position: [600, 0],
      parameters: {},
    },
    {
      id: 'slack',
      name: 'Notify Slack',
      type: 'nous.app.slack.send-message',
      position: [800, 0],
      parameters: { channel: '#general' },
    },
  ],
  connections: [
    { from: 'trigger', to: 'search' },
    { from: 'search', to: 'gate' },
    { from: 'gate', to: 'agent' },
    { from: 'agent', to: 'slack' },
  ],
};

const projectId = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// specToWorkflowDefinition tests
// ---------------------------------------------------------------------------

describe('specToWorkflowDefinition', () => {
  it('converts a linear spec to a WorkflowDefinition', () => {
    const def = specToWorkflowDefinition(linearSpec, { projectId });

    expect(def.name).toBe('Linear Workflow');
    expect(def.version).toBe('1');
    expect(def.projectId).toBe(projectId);
    expect(def.mode).toBe('protocol');
    expect(def.nodes).toHaveLength(3);
    expect(def.edges).toHaveLength(2);
    expect(def.entryNodeIds).toHaveLength(1);
  });

  it('assigns UUID IDs to all nodes', () => {
    const def = specToWorkflowDefinition(linearSpec, { projectId });
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    for (const node of def.nodes) {
      expect(node.id).toMatch(uuidRegex);
    }
  });

  it('correctly identifies entry nodes (no incoming connections)', () => {
    const def = specToWorkflowDefinition(linearSpec, { projectId });
    // Only "trigger" has no incoming connections
    expect(def.entryNodeIds).toHaveLength(1);
  });

  it('maps agent nodes to model-call type', () => {
    const def = specToWorkflowDefinition(linearSpec, { projectId });
    const agentNode = def.nodes.find((n) => n.name === 'Claude Agent');
    expect(agentNode).toBeDefined();
    expect(agentNode!.type).toBe('model-call');
    expect(agentNode!.config.type).toBe('model-call');
  });

  it('maps condition nodes to condition type', () => {
    const def = specToWorkflowDefinition(conditionalSpec, { projectId });
    const condNode = def.nodes.find((n) => n.name === 'Check Condition');
    expect(condNode).toBeDefined();
    expect(condNode!.type).toBe('condition');
    expect(condNode!.config.type).toBe('condition');
  });

  it('maps conditional connections to edges with branchKey', () => {
    const def = specToWorkflowDefinition(conditionalSpec, { projectId });
    const branchedEdges = def.edges.filter((e) => e.branchKey != null);
    expect(branchedEdges).toHaveLength(2);

    const branchKeys = branchedEdges.map((e) => e.branchKey).sort();
    expect(branchKeys).toEqual(['false', 'true']);
  });

  it('maps memory nodes to tool-execution type', () => {
    const def = specToWorkflowDefinition(linearSpec, { projectId });
    const memNode = def.nodes.find((n) => n.name === 'Save to Memory');
    expect(memNode).toBeDefined();
    expect(memNode!.type).toBe('tool-execution');
    expect(memNode!.config.type).toBe('tool-execution');
  });

  it('maps governance nodes to quality-gate type', () => {
    const def = specToWorkflowDefinition(mixedTypesSpec, { projectId });
    const gateNode = def.nodes.find((n) => n.name === 'Governance Gate');
    expect(gateNode).toBeDefined();
    expect(gateNode!.type).toBe('quality-gate');
    expect(gateNode!.config.type).toBe('quality-gate');
  });

  it('maps app nodes to tool-execution type', () => {
    const def = specToWorkflowDefinition(mixedTypesSpec, { projectId });
    const appNode = def.nodes.find((n) => n.name === 'Notify Slack');
    expect(appNode).toBeDefined();
    expect(appNode!.type).toBe('tool-execution');
    expect(appNode!.config.type).toBe('tool-execution');
  });

  it('maps trigger nodes to transform type', () => {
    const def = specToWorkflowDefinition(linearSpec, { projectId });
    const triggerNode = def.nodes.find((n) => n.name === 'Schedule Trigger');
    expect(triggerNode).toBeDefined();
    expect(triggerNode!.type).toBe('transform');
    expect(triggerNode!.config.type).toBe('transform');
  });

  it('uses custom definitionId when provided', () => {
    const customId = '11111111-1111-1111-1111-111111111111';
    const def = specToWorkflowDefinition(linearSpec, {
      projectId,
      definitionId: customId,
    });
    expect(def.id).toBe(customId);
  });

  it('uses custom mode when provided', () => {
    const def = specToWorkflowDefinition(linearSpec, {
      projectId,
      mode: 'hybrid',
    });
    expect(def.mode).toBe('hybrid');
  });

  it('adds node metadata when enrichment is provided', () => {
    const def = specToWorkflowDefinition(linearSpec, {
      projectId,
      enrichment: {
        agent: {
          skill: 'atomic-research',
          contracts: ['quality-gate'],
          templates: ['goals-template'],
          body: '# Claude Agent',
        },
      },
    });

    const agentNode = def.nodes.find((node) => node.name === 'Claude Agent');
    expect(agentNode?.metadata).toEqual({
      specNodeId: 'agent',
      skill: 'atomic-research',
      contracts: ['quality-gate'],
      templates: ['goals-template'],
    });
  });

  it('only enriches the nodes present in the enrichment map', () => {
    const def = specToWorkflowDefinition(linearSpec, {
      projectId,
      enrichment: {
        save: {
          contracts: ['retention-policy'],
        },
      },
    });

    const saveNode = def.nodes.find((node) => node.name === 'Save to Memory');
    const triggerNode = def.nodes.find(
      (node) => node.name === 'Schedule Trigger',
    );

    expect(saveNode?.metadata).toEqual({
      specNodeId: 'save',
      skill: undefined,
      contracts: ['retention-policy'],
      templates: undefined,
    });
    expect(triggerNode).not.toHaveProperty('metadata');
  });

  it('preserves backward compatibility when enrichment is omitted', () => {
    const def = specToWorkflowDefinition(linearSpec, { projectId });

    expect(def.nodes.every((node) => !('metadata' in node))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// specToExecutionGraph tests
// ---------------------------------------------------------------------------

describe('specToExecutionGraph', () => {
  it('produces a valid DerivedWorkflowGraph from a linear spec', () => {
    const graph = specToExecutionGraph(linearSpec, { projectId });

    expect(graph.workflowDefinitionId).toBeDefined();
    expect(graph.projectId).toBe(projectId);
    expect(graph.version).toBe('1');
    expect(graph.graphDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(graph.entryNodeIds).toHaveLength(1);
    expect(graph.topologicalOrder).toHaveLength(3);
    expect(Object.keys(graph.nodes)).toHaveLength(3);
    expect(Object.keys(graph.edges)).toHaveLength(2);
  });

  it('produces a valid DerivedWorkflowGraph from a conditional spec', () => {
    const graph = specToExecutionGraph(conditionalSpec, { projectId });

    expect(graph.topologicalOrder).toHaveLength(4);
    expect(Object.keys(graph.nodes)).toHaveLength(4);
    expect(Object.keys(graph.edges)).toHaveLength(3);
  });

  it('produces a valid DerivedWorkflowGraph from a mixed-type spec', () => {
    const graph = specToExecutionGraph(mixedTypesSpec, { projectId });

    expect(graph.topologicalOrder).toHaveLength(5);
    expect(Object.keys(graph.nodes)).toHaveLength(5);
    expect(Object.keys(graph.edges)).toHaveLength(4);
  });

  it('maintains topological ordering (entry nodes first)', () => {
    const graph = specToExecutionGraph(linearSpec, { projectId });
    const entryNodeId = graph.entryNodeIds[0]!;
    const entryIndex = graph.nodes[entryNodeId]!.topologicalIndex;
    expect(entryIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mapNodeTypeToDispatchTarget tests
// ---------------------------------------------------------------------------

describe('mapNodeTypeToDispatchTarget', () => {
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
      const result = mapNodeTypeToDispatchTarget(kind);
      expect(result.executionMode).toBe(expectedMode);
      expect(result.agentClass).toBe(expectedClass);
    },
  );

  it('returns fail-safe default for unknown node kind', () => {
    const result = mapNodeTypeToDispatchTarget(
      'nonexistent-type' as WorkflowNodeKind,
    );
    expect(result.executionMode).toBe('internal');
    expect(result.agentClass).toBeNull();
  });
});
