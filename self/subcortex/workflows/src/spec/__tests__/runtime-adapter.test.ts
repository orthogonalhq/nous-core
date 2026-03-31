/**
 * Tests for the runtime adapter — specToWorkflowDefinition / specToExecutionGraph.
 */
import { describe, it, expect } from 'vitest';
import {
  specToWorkflowDefinition,
  specToExecutionGraph,
} from '../runtime-adapter.js';
import {
  WorkflowNodeConfigSchema,
  WorkflowTypedNodeConfigSchema,
  WorkflowNodeDefinitionSchema,
  NODE_TYPE_PARAMETER_SCHEMAS,
  NodeTypeSchema,
  validateWorkflowSpec,
} from '@nous/shared';
import type { WorkflowSpec } from '@nous/shared';

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
// Logic gate type system tests (WR-108 Phase 1.1)
// ---------------------------------------------------------------------------

// Helper to make a spec node for logic gate tests
function makeSpecNode(
  id: string,
  type: string,
  parameters: Record<string, unknown> = {},
): WorkflowSpec['nodes'][number] {
  return { id, name: id, type, position: [0, 0] as [number, number], parameters };
}

// Helper to build a minimal WorkflowSpec with a single logic gate node
function makeLogicGateSpec(
  nodeType: string,
  parameters: Record<string, unknown>,
): WorkflowSpec {
  return {
    name: 'Logic Gate Test',
    version: 1,
    nodes: [
      makeSpecNode('trigger', 'nous.trigger.schedule', { cron: '0 * * * *' }),
      makeSpecNode('gate', nodeType, parameters),
    ],
    connections: [{ from: 'trigger', to: 'gate' }],
  };
}

// ---------------------------------------------------------------------------
// Tier 1 — Contract Tests
// ---------------------------------------------------------------------------

describe('Tier 1 — Schema contract tests', () => {
  it('NODE_TYPE_PARAMETER_SCHEMAS has 21 entries', () => {
    expect(Object.keys(NODE_TYPE_PARAMETER_SCHEMAS).length).toBe(21);
  });

  it('NodeTypeSchema has 10 values', () => {
    expect(NodeTypeSchema.options.length).toBe(10);
  });

  it.each([
    ['parallel-split', { type: 'parallel-split', splitMode: 'all', branches: [] }],
    ['parallel-join', { type: 'parallel-join', joinMode: 'all' }],
    ['loop', { type: 'loop', maxIterations: 5, exitConditionRef: 'check' }],
    ['error-handler', { type: 'error-handler', catchScope: 'upstream' }],
  ] as const)('WorkflowNodeConfigSchema parses %s config', (_kind, config) => {
    const result = WorkflowNodeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe(config.type);
    }
  });

  it.each([
    ['parallel-split', { type: 'parallel-split', splitMode: 'all', branches: [] }],
    ['parallel-join', { type: 'parallel-join', joinMode: 'all' }],
    ['loop', { type: 'loop', maxIterations: 5, exitConditionRef: 'check' }],
    ['error-handler', { type: 'error-handler', catchScope: 'upstream' }],
  ] as const)('WorkflowTypedNodeConfigSchema parses %s config', (_kind, config) => {
    const result = WorkflowTypedNodeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it.each([
    'parallel-split',
    'parallel-join',
    'loop',
    'error-handler',
  ] as const)('WorkflowNodeDefinitionSchema superRefine accepts %s', (kind) => {
    const configMap: Record<string, Record<string, unknown>> = {
      'parallel-split': { type: 'parallel-split', splitMode: 'all', branches: [] },
      'parallel-join': { type: 'parallel-join', joinMode: 'all' },
      'loop': { type: 'loop', maxIterations: 5, exitConditionRef: 'check' },
      'error-handler': { type: 'error-handler', catchScope: 'upstream' },
    };
    const nodeDef = {
      id: '00000000-0000-0000-0000-000000000099',
      name: `Test ${kind}`,
      type: kind,
      governance: 'should',
      executionModel: 'synchronous',
      config: configMap[kind],
    };
    const result = WorkflowNodeDefinitionSchema.safeParse(nodeDef);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — Behavior Tests (adapter mapping)
// ---------------------------------------------------------------------------

describe('Tier 2 — mapNodeTypeToConfig for logic gates', () => {
  it('returns parallel-split config for nous.condition.parallel-split', () => {
    const spec = makeLogicGateSpec('nous.condition.parallel-split', {
      splitMode: 'race',
      branches: ['a', 'b'],
    });
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.config.type).toBe('parallel-split');
    if (node.config.type === 'parallel-split') {
      expect(node.config.splitMode).toBe('race');
      expect(node.config.branches).toEqual(['a', 'b']);
    }
  });

  it('returns parallel-join config for nous.condition.parallel-join', () => {
    const spec = makeLogicGateSpec('nous.condition.parallel-join', {
      joinMode: 'n-of-m',
      requiredCount: 3,
      timeoutMs: 5000,
    });
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.config.type).toBe('parallel-join');
    if (node.config.type === 'parallel-join') {
      expect(node.config.joinMode).toBe('n-of-m');
      expect(node.config.requiredCount).toBe(3);
      expect(node.config.timeoutMs).toBe(5000);
    }
  });

  it('returns loop config for nous.condition.loop', () => {
    const spec = makeLogicGateSpec('nous.condition.loop', {
      maxIterations: 5,
      exitConditionRef: 'done-check',
      backoffMs: 100,
    });
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.config.type).toBe('loop');
    if (node.config.type === 'loop') {
      expect(node.config.maxIterations).toBe(5);
      expect(node.config.exitConditionRef).toBe('done-check');
      expect(node.config.backoffMs).toBe(100);
    }
  });

  it('returns error-handler config for nous.condition.error-handler', () => {
    const spec = makeLogicGateSpec('nous.condition.error-handler', {
      catchScope: 'specific',
      targetNodeIds: ['node-1', 'node-2'],
    });
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.config.type).toBe('error-handler');
    if (node.config.type === 'error-handler') {
      expect(node.config.catchScope).toBe('specific');
      expect(node.config.targetNodeIds).toEqual(['node-1', 'node-2']);
    }
  });
});

describe('Tier 2 — mapNodeTypeToRuntimeType for logic gates', () => {
  it.each([
    ['nous.condition.parallel-split', 'parallel-split'],
    ['nous.condition.parallel-join', 'parallel-join'],
    ['nous.condition.loop', 'loop'],
    ['nous.condition.error-handler', 'error-handler'],
  ])('maps %s to runtime type %s', (specType, expectedRuntimeType) => {
    const spec = makeLogicGateSpec(specType, {});
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.type).toBe(expectedRuntimeType);
  });
});

describe('Tier 2 — specToWorkflowDefinition end-to-end for logic gates', () => {
  it('converts a spec with all 4 logic gate types', () => {
    const spec: WorkflowSpec = {
      name: 'All Logic Gates',
      version: 1,
      nodes: [
        makeSpecNode('trigger', 'nous.trigger.schedule', { cron: '0 * * * *' }),
        makeSpecNode('split', 'nous.condition.parallel-split', { splitMode: 'all' }),
        makeSpecNode('join', 'nous.condition.parallel-join', { joinMode: 'all' }),
        makeSpecNode('loop-node', 'nous.condition.loop', { maxIterations: 10, exitConditionRef: 'check' }),
        makeSpecNode('error', 'nous.condition.error-handler', { catchScope: 'upstream' }),
      ],
      connections: [
        { from: 'trigger', to: 'split' },
        { from: 'split', to: 'join' },
        { from: 'join', to: 'loop-node' },
        { from: 'loop-node', to: 'error' },
      ],
    };
    const def = specToWorkflowDefinition(spec, { projectId });

    const splitNode = def.nodes.find((n) => n.name === 'split')!;
    const joinNode = def.nodes.find((n) => n.name === 'join')!;
    const loopNode = def.nodes.find((n) => n.name === 'loop-node')!;
    const errorNode = def.nodes.find((n) => n.name === 'error')!;

    expect(splitNode.type).toBe('parallel-split');
    expect(splitNode.config.type).toBe('parallel-split');
    expect(joinNode.type).toBe('parallel-join');
    expect(joinNode.config.type).toBe('parallel-join');
    expect(loopNode.type).toBe('loop');
    expect(loopNode.config.type).toBe('loop');
    expect(errorNode.type).toBe('error-handler');
    expect(errorNode.config.type).toBe('error-handler');
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — Regression Tests
// ---------------------------------------------------------------------------

describe('Tier 2 — Regression: existing condition types unchanged', () => {
  it('mapNodeTypeToConfig still returns condition config for nous.condition.if', () => {
    const spec = makeLogicGateSpec('nous.condition.if', { expression: 'x > 1' });
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.config.type).toBe('condition');
    if (node.config.type === 'condition') {
      expect(node.config.predicateRef).toBe('inline:gate');
      expect(node.config.trueBranchKey).toBe('true');
      expect(node.config.falseBranchKey).toBe('false');
    }
  });

  it('mapNodeTypeToConfig still returns condition config for nous.condition.switch', () => {
    const spec = makeLogicGateSpec('nous.condition.switch', { expression: 'x' });
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.config.type).toBe('condition');
  });

  it('mapNodeTypeToConfig still returns condition config for nous.condition.governance-gate', () => {
    const spec = makeLogicGateSpec('nous.condition.governance-gate', { level: 'must' });
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.config.type).toBe('condition');
  });

  it.each([
    'nous.condition.if',
    'nous.condition.switch',
    'nous.condition.governance-gate',
  ])('mapNodeTypeToRuntimeType still returns condition for %s', (specType) => {
    const spec = makeLogicGateSpec(specType, {});
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.type).toBe('condition');
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — Deep Validation Tests
// ---------------------------------------------------------------------------

describe('Tier 2 — validateWorkflowSpec deep mode', () => {
  it('accepts valid nous.condition.parallel-split parameters', () => {
    const spec = makeLogicGateSpec('nous.condition.parallel-split', { splitMode: 'all' });
    const result = validateWorkflowSpec(spec, { deep: true });
    expect(result.success).toBe(true);
  });

  it('accepts valid nous.condition.parallel-join parameters', () => {
    const spec = makeLogicGateSpec('nous.condition.parallel-join', { joinMode: 'any' });
    const result = validateWorkflowSpec(spec, { deep: true });
    expect(result.success).toBe(true);
  });

  it('accepts valid nous.condition.loop parameters', () => {
    const spec = makeLogicGateSpec('nous.condition.loop', {
      maxIterations: 10,
      exitConditionRef: 'check',
    });
    const result = validateWorkflowSpec(spec, { deep: true });
    expect(result.success).toBe(true);
  });

  it('accepts valid nous.condition.error-handler parameters', () => {
    const spec = makeLogicGateSpec('nous.condition.error-handler', { catchScope: 'upstream' });
    const result = validateWorkflowSpec(spec, { deep: true });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — Edge Case Tests
// ---------------------------------------------------------------------------

describe('Tier 3 — Edge cases', () => {
  it('rejects nous.condition.loop with missing maxIterations', () => {
    const spec = makeLogicGateSpec('nous.condition.loop', { exitConditionRef: 'check' });
    const result = validateWorkflowSpec(spec, { deep: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.path.includes('maxIterations'))).toBe(true);
    }
  });

  it('rejects nous.condition.loop with missing exitConditionRef', () => {
    const spec = makeLogicGateSpec('nous.condition.loop', { maxIterations: 5 });
    const result = validateWorkflowSpec(spec, { deep: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.path.includes('exitConditionRef'))).toBe(true);
    }
  });

  it('rejects nous.condition.parallel-join with invalid joinMode', () => {
    const spec = makeLogicGateSpec('nous.condition.parallel-join', { joinMode: 'invalid' });
    const result = validateWorkflowSpec(spec, { deep: true });
    expect(result.success).toBe(false);
  });

  it('sub-switch default handles unknown nous.condition.* type in mapNodeTypeToConfig', () => {
    const spec = makeLogicGateSpec('nous.condition.unknown-future-type', {});
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.config.type).toBe('condition');
  });

  it('sub-switch default handles unknown nous.condition.* type in mapNodeTypeToRuntimeType', () => {
    const spec = makeLogicGateSpec('nous.condition.unknown-future-type', {});
    const def = specToWorkflowDefinition(spec, { projectId });
    const node = def.nodes.find((n) => n.name === 'gate')!;
    expect(node.type).toBe('condition');
  });
});
