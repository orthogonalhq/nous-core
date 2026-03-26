/**
 * Workflow node handler tests.
 *
 * Validates that the coding agent node handler correctly dispatches to
 * Claude and Codex SDK adapters, fires governance hooks, and handles
 * error conditions including unknown agent types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IPfcEngine,
  IWitnessService,
  PfcDecision,
  WorkflowNodeExecutionContext,
  WorkflowNodeKind,
  WorkflowNodeDefinitionId,
  IWorkflowNodeHandler,
  ConfidenceGovernanceEvaluationResult,
} from '@nous/shared';
import type { MaoAgentEvent } from '../types.js';
import {
  createCodingAgentNodeHandler,
  registerCodingAgentNodeTypes,
  CODING_AGENT_NODE_TYPES,
} from '../workflow-node-handler.js';

// ---------------------------------------------------------------------------
// Mock SDK modules — intercept dynamic imports
// ---------------------------------------------------------------------------

// Mock the Claude adapter
vi.mock('../claude-adapter.js', () => ({
  runClaudeAgent: vi.fn().mockResolvedValue({
    success: true,
    messages: [{ type: 'result', result: 'Task completed' }],
    finalResponse: 'Task completed',
  }),
}));

// Mock the Codex adapter
vi.mock('../codex-adapter.js', () => ({
  runCodexAgent: vi.fn().mockResolvedValue({
    success: true,
    messages: [{ type: 'item.completed', item: { type: 'agent_message', text: 'Done' } }],
    finalResponse: 'Done',
  }),
}));

// Re-import after mocking
import { runClaudeAgent } from '../claude-adapter.js';
import { runCodexAgent } from '../codex-adapter.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockPfcEngine(defaultApproved = true): IPfcEngine {
  return {
    evaluateToolExecution: vi.fn().mockResolvedValue({
      approved: defaultApproved,
      reason: defaultApproved ? 'allowed' : 'denied',
      confidence: 0.95,
    } satisfies PfcDecision),
    evaluateConfidenceGovernance: vi.fn(),
    evaluateMemoryWrite: vi.fn(),
    evaluateMemoryMutation: vi.fn(),
    reflect: vi.fn(),
    evaluateEscalation: vi.fn(),
    getTier: vi.fn().mockReturnValue('t0'),
  } as unknown as IPfcEngine;
}

function makeMockWitnessService(): IWitnessService {
  return {
    appendAuthorization: vi.fn().mockResolvedValue({ id: 'witness-auth-1' }),
    appendCompletion: vi.fn().mockResolvedValue({ id: 'witness-comp-1' }),
    appendInvariant: vi.fn().mockResolvedValue({ id: 'witness-inv-1' }),
    createCheckpoint: vi.fn(),
    rotateKeyEpoch: vi.fn(),
    verify: vi.fn(),
    getReport: vi.fn(),
    listReports: vi.fn(),
    getLatestCheckpoint: vi.fn(),
  } as unknown as IWitnessService;
}

function makeMockGovernanceDecision(): ConfidenceGovernanceEvaluationResult {
  return {
    outcome: 'allow_autonomy',
    reasonCode: 'CGR-ALLOW-HIGH-CONFIDENCE',
    governance: 'should',
    actionCategory: 'model-invoke',
    patternId: '550e8400-e29b-41d4-a716-446655440801' as ConfidenceGovernanceEvaluationResult['patternId'],
    confidence: 0.95,
    confidenceTier: 'high',
    supportingSignals: 16,
    decayState: 'stable',
    autonomyAllowed: true,
    requiresConfirmation: false,
    highRiskOverrideApplied: false,
    evidenceRefs: [{ actionCategory: 'model-invoke', authorizationEventId: '550e8400-e29b-41d4-a716-446655440802' }] as ConfidenceGovernanceEvaluationResult['evidenceRefs'],
    explanation: {
      patternId: '550e8400-e29b-41d4-a716-446655440801' as ConfidenceGovernanceEvaluationResult['explanation']['patternId'],
      outcomeRef: 'workflow:node-1',
      evidenceRefs: [{ actionCategory: 'model-invoke', authorizationEventId: '550e8400-e29b-41d4-a716-446655440802' }] as ConfidenceGovernanceEvaluationResult['explanation']['evidenceRefs'],
    },
  } as unknown as ConfidenceGovernanceEvaluationResult;
}

function makeContext(overrides?: {
  promptRef?: string;
  configType?: string;
  payload?: Record<string, unknown>;
}): WorkflowNodeExecutionContext {
  return {
    projectConfig: { id: 'test-project-1' } as WorkflowNodeExecutionContext['projectConfig'],
    graph: {} as WorkflowNodeExecutionContext['graph'],
    runState: {} as WorkflowNodeExecutionContext['runState'],
    nodeDefinition: {
      id: 'node-1' as WorkflowNodeDefinitionId,
      name: 'Test Agent Node',
      type: 'model-call' as WorkflowNodeKind,
      governance: 'should',
      executionModel: 'synchronous',
      config: {
        type: (overrides?.configType ?? 'model-call') as 'model-call',
        modelRole: 'orchestrator' as const,
        promptRef: overrides?.promptRef ?? 'default:nous.agent.claude',
        outputSchemaRef: 'schema://node-1/output',
      },
    },
    dispatchLineage: {
      id: 'lineage-1',
      evidenceRefs: ['test-evidence-ref'],
    } as WorkflowNodeExecutionContext['dispatchLineage'],
    controlState: 'active' as WorkflowNodeExecutionContext['controlState'],
    governanceInput: {} as WorkflowNodeExecutionContext['governanceInput'],
    governanceDecision: makeMockGovernanceDecision(),
    payload: overrides?.payload as WorkflowNodeExecutionContext['payload'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCodingAgentNodeHandler', () => {
  let pfcEngine: IPfcEngine;
  let witnessService: IWitnessService;
  let maoEvents: MaoAgentEvent[];
  let handler: IWorkflowNodeHandler;

  beforeEach(() => {
    vi.clearAllMocks();

    pfcEngine = makeMockPfcEngine(true);
    witnessService = makeMockWitnessService();
    maoEvents = [];

    handler = createCodingAgentNodeHandler({
      pfcEngine,
      witnessService,
      onMaoEvent: (event) => maoEvents.push(event),
    });
  });

  it('has nodeType set to model-call', () => {
    expect(handler.nodeType).toBe('model-call');
  });

  describe('dispatches to correct adapter', () => {
    it('dispatches nous.agent.claude to runClaudeAgent', async () => {
      const context = makeContext({ promptRef: 'default:nous.agent.claude' });
      const result = await handler.execute(context);

      expect(runClaudeAgent).toHaveBeenCalledTimes(1);
      expect(runCodexAgent).not.toHaveBeenCalled();
      expect(result.outcome).toBe('completed');
      expect(result.reasonCode).toBe('coding_agent_completed');
    });

    it('dispatches nous.agent.codex to runCodexAgent', async () => {
      const context = makeContext({ promptRef: 'default:nous.agent.codex' });
      const result = await handler.execute(context);

      expect(runCodexAgent).toHaveBeenCalledTimes(1);
      expect(runClaudeAgent).not.toHaveBeenCalled();
      expect(result.outcome).toBe('completed');
      expect(result.reasonCode).toBe('coding_agent_completed');
    });
  });

  describe('governance hooks fire', () => {
    it('passes governance deps to createGovernanceHooks', async () => {
      const context = makeContext({
        promptRef: 'default:nous.agent.claude',
        payload: { prompt: 'Test prompt' },
      });

      await handler.execute(context);

      // The adapter was called with hooks that have our deps wired
      expect(runClaudeAgent).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Test prompt' }),
        expect.objectContaining({
          onPreToolUse: expect.any(Function),
          onPostToolUse: expect.any(Function),
          onStop: expect.any(Function),
          onMessage: expect.any(Function),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('throws when config type is not model-call', async () => {
      const context = makeContext({ configType: 'tool-execution' });

      await expect(handler.execute(context)).rejects.toThrow(
        'CodingAgentNodeHandler received non model-call config',
      );
    });

    it('throws when promptRef contains unknown agent type', async () => {
      const context = makeContext({ promptRef: 'default:nous.agent.unknown' });

      await expect(handler.execute(context)).rejects.toThrow(
        'Unknown agent node type in promptRef',
      );
    });

    it('returns failed outcome when adapter throws', async () => {
      vi.mocked(runClaudeAgent).mockRejectedValueOnce(
        new Error('@anthropic-ai/claude-agent-sdk is not installed.'),
      );

      const context = makeContext({ promptRef: 'default:nous.agent.claude' });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('failed');
      expect(result.reasonCode).toBe('coding_agent_error');
      expect(result.evidenceRefs).toContain(
        'error=@anthropic-ai/claude-agent-sdk is not installed.',
      );
    });

    it('returns failed outcome when adapter returns success=false', async () => {
      vi.mocked(runClaudeAgent).mockResolvedValueOnce({
        success: false,
        messages: [],
        finalResponse: undefined,
      });

      const context = makeContext({ promptRef: 'default:nous.agent.claude' });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('failed');
      expect(result.reasonCode).toBe('coding_agent_failed');
    });
  });

  describe('task input extraction', () => {
    it('extracts prompt from payload', async () => {
      const context = makeContext({
        promptRef: 'default:nous.agent.claude',
        payload: {
          prompt: 'Build the auth module',
          allowedTools: ['Read', 'Write'],
          workingDirectory: '/tmp/project',
          maxTurns: 10,
          model: 'claude-sonnet-4-6',
        },
      });

      await handler.execute(context);

      expect(runClaudeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Build the auth module',
          allowedTools: ['Read', 'Write'],
          workingDirectory: '/tmp/project',
          maxTurns: 10,
          model: 'claude-sonnet-4-6',
        }),
        expect.any(Object),
      );
    });

    it('uses node name as fallback prompt when payload has no prompt', async () => {
      const context = makeContext({ promptRef: 'default:nous.agent.claude' });

      await handler.execute(context);

      expect(runClaudeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Execute workflow node: Test Agent Node',
        }),
        expect.any(Object),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('registerCodingAgentNodeTypes', () => {
  it('registers handler in the provided registry map', () => {
    const registry = new Map<WorkflowNodeKind, IWorkflowNodeHandler>();

    registerCodingAgentNodeTypes(registry, {});

    expect(registry.has('model-call' as WorkflowNodeKind)).toBe(true);
    const handler = registry.get('model-call' as WorkflowNodeKind)!;
    expect(handler.nodeType).toBe('model-call');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('CODING_AGENT_NODE_TYPES', () => {
  it('contains expected agent types', () => {
    expect(CODING_AGENT_NODE_TYPES).toContain('nous.agent.claude');
    expect(CODING_AGENT_NODE_TYPES).toContain('nous.agent.codex');
    expect(CODING_AGENT_NODE_TYPES).toHaveLength(2);
  });
});
