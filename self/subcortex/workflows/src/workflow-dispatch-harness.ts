/**
 * WorkflowDispatchHarness — Classical code harness that drives workflow
 * execution through the dispatch system.
 *
 * Composes: workflow engine (state machine), dispatch callbacks
 * (Workers/Orchestrators), and the mapping table (dispatch decisions).
 *
 * This is purely mechanical code — no LLM calls, no prompt construction.
 * The Orchestrator LLM is only consulted for genuine judgment calls
 * outside this harness.
 */
import {
  WORKFLOW_NODE_DISPATCH_MAP,
  type AgentResult,
  type DerivedWorkflowGraph,
  type DispatchOrchestratorRequest,
  type DispatchWorkerRequest,
  type GatewayLifecycleContext,
  type IWorkflowEngine,
  type WorkflowExecutionId,
  type WorkflowNodeDefinitionId,
  type WorkflowNodeKind,
  type WorkflowRunState,
  type WorkflowTransitionInput,
} from '@nous/shared';
import type { WorkflowRuntimeObserver } from './execution-coordinator.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface WorkflowDispatchHarnessConfig {
  engine: IWorkflowEngine;
  dispatchWorker: (
    request: DispatchWorkerRequest,
    context: GatewayLifecycleContext,
  ) => Promise<AgentResult>;
  dispatchOrchestrator: (
    request: DispatchOrchestratorRequest,
    context: GatewayLifecycleContext,
  ) => Promise<AgentResult>;
  concurrencyLimit?: number;
  maxNodeAttempts?: number;
  observer?: WorkflowRuntimeObserver;
}

export interface HarnessRunInput {
  runId: WorkflowExecutionId;
  graph: DerivedWorkflowGraph;
  initialRunState: WorkflowRunState;
  lifecycleContext: GatewayLifecycleContext;
}

export interface HarnessRunResult {
  finalRunState: WorkflowRunState;
  nodeResults: Map<WorkflowNodeDefinitionId, HarnessNodeResult>;
  totalUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  suspended: boolean;
}

export interface HarnessNodeResult {
  nodeDefinitionId: WorkflowNodeDefinitionId;
  executionMode: 'internal' | 'dispatched';
  agentResult?: AgentResult;
  engineResult?: WorkflowRunState;
  usage?: { tokensUsed: number };
}

// ---------------------------------------------------------------------------
// AgentResult → node outcome mapping
// ---------------------------------------------------------------------------

interface NodeOutcome {
  status: 'completed' | 'failed';
  reasonCode: string;
}

function mapAgentResultToNodeOutcome(result: AgentResult): NodeOutcome {
  switch (result.status) {
    case 'completed':
      return { status: 'completed', reasonCode: 'node_completed_by_agent' };
    case 'escalated':
      return { status: 'failed', reasonCode: 'agent_escalated' };
    case 'aborted':
      return { status: 'failed', reasonCode: 'agent_aborted' };
    case 'budget_exhausted':
      return { status: 'failed', reasonCode: 'agent_budget_exhausted' };
    case 'error':
      return { status: 'failed', reasonCode: 'agent_error' };
    case 'suspended':
      // Suspended is handled separately — should not reach here in normal flow
      return { status: 'failed', reasonCode: 'agent_suspended' };
    default:
      return { status: 'failed', reasonCode: 'agent_unknown_status' };
  }
}

// ---------------------------------------------------------------------------
// Harness implementation
// ---------------------------------------------------------------------------

const DEFAULT_CONCURRENCY_LIMIT = 6;
const DEFAULT_MAX_NODE_ATTEMPTS = 3;

export class WorkflowDispatchHarness {
  private readonly engine: IWorkflowEngine;
  private readonly dispatchWorker: WorkflowDispatchHarnessConfig['dispatchWorker'];
  private readonly dispatchOrchestrator: WorkflowDispatchHarnessConfig['dispatchOrchestrator'];
  private readonly concurrencyLimit: number;
  private readonly maxNodeAttempts: number;
  private readonly observer?: WorkflowRuntimeObserver;

  constructor(config: WorkflowDispatchHarnessConfig) {
    this.engine = config.engine;
    this.dispatchWorker = config.dispatchWorker;
    this.dispatchOrchestrator = config.dispatchOrchestrator;
    this.concurrencyLimit = config.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;
    this.maxNodeAttempts = config.maxNodeAttempts ?? DEFAULT_MAX_NODE_ATTEMPTS;
    this.observer = config.observer;
  }

  async run(input: HarnessRunInput): Promise<HarnessRunResult> {
    const { runId, graph, lifecycleContext } = input;
    let currentState = input.initialRunState;
    const nodeResults = new Map<WorkflowNodeDefinitionId, HarnessNodeResult>();
    const nodeAttemptCounts = new Map<WorkflowNodeDefinitionId, number>();
    const totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    while (true) {
      const readyNodeIds = currentState.readyNodeIds;

      // Terminal: no more ready nodes
      if (readyNodeIds.length === 0) {
        break;
      }

      // Check for human-decision nodes — suspend if any
      const humanDecisionNodes = readyNodeIds.filter((nodeId) => {
        const derivedNode = graph.nodes[nodeId];
        return derivedNode?.definition.type === 'human-decision';
      });

      if (humanDecisionNodes.length > 0) {
        await this.observer?.event('harness:run_suspended', {
          runId,
          humanDecisionNodeIds: humanDecisionNodes,
        });
        return {
          finalRunState: currentState,
          nodeResults,
          totalUsage,
          suspended: true,
        };
      }

      // Partition ready nodes into internal vs dispatched
      const internalNodes: WorkflowNodeDefinitionId[] = [];
      const dispatchedNodes: WorkflowNodeDefinitionId[] = [];

      for (const nodeId of readyNodeIds) {
        const derivedNode = graph.nodes[nodeId];
        if (!derivedNode) continue;
        const mapping = WORKFLOW_NODE_DISPATCH_MAP[derivedNode.definition.type as WorkflowNodeKind];
        if (!mapping) continue;

        if (mapping.executionMode === 'internal') {
          internalNodes.push(nodeId);
        } else {
          dispatchedNodes.push(nodeId);
        }
      }

      // Execute internal nodes sequentially via engine
      for (const nodeId of internalNodes) {
        const attempts = (nodeAttemptCounts.get(nodeId) ?? 0) + 1;
        nodeAttemptCounts.set(nodeId, attempts);

        if (attempts > this.maxNodeAttempts) {
          // Exceeded max attempts — fail the node
          const failTransition: WorkflowTransitionInput = {
            reasonCode: 'max_node_attempts_exceeded',
            evidenceRefs: [],
          };
          currentState = await this.engine.completeNode(runId, nodeId, failTransition);
          nodeResults.set(nodeId, {
            nodeDefinitionId: nodeId,
            executionMode: 'internal',
          });
          await this.observer?.event('harness:node_failed', {
            runId,
            nodeDefinitionId: nodeId,
            reasonCode: 'max_node_attempts_exceeded',
          });
          continue;
        }

        await this.observer?.event('harness:node_dispatched', {
          runId,
          nodeDefinitionId: nodeId,
          executionMode: 'internal',
          agentClass: null,
        });

        const startMs = Date.now();
        try {
          const controlState = 'running' as const;
          const engineState = await this.engine.executeReadyNode({
            executionId: runId,
            nodeDefinitionId: nodeId,
            controlState,
            transition: {
              reasonCode: 'harness_execute_internal',
              evidenceRefs: [],
            },
          });
          currentState = engineState;
          nodeResults.set(nodeId, {
            nodeDefinitionId: nodeId,
            executionMode: 'internal',
            engineResult: engineState,
          });
          await this.observer?.event('harness:node_completed', {
            runId,
            nodeDefinitionId: nodeId,
            outcome: 'completed',
            durationMs: Date.now() - startMs,
          });
        } catch (error) {
          // Engine execution failed — mark node as failed
          const failTransition: WorkflowTransitionInput = {
            reasonCode: 'engine_execution_error',
            evidenceRefs: [],
          };
          try {
            currentState = await this.engine.completeNode(runId, nodeId, failTransition);
          } catch {
            // If completeNode also fails, break out
            break;
          }
          nodeResults.set(nodeId, {
            nodeDefinitionId: nodeId,
            executionMode: 'internal',
          });
          await this.observer?.event('harness:node_failed', {
            runId,
            nodeDefinitionId: nodeId,
            reasonCode: 'engine_execution_error',
            durationMs: Date.now() - startMs,
          });
        }
      }

      // Dispatch external nodes in parallel, bounded by concurrency limit
      const batches = this.batchNodes(dispatchedNodes, this.concurrencyLimit);

      for (const batch of batches) {
        const dispatchPromises = batch.map(async (nodeId) => {
          const derivedNode = graph.nodes[nodeId];
          if (!derivedNode) return;

          const attempts = (nodeAttemptCounts.get(nodeId) ?? 0) + 1;
          nodeAttemptCounts.set(nodeId, attempts);

          if (attempts > this.maxNodeAttempts) {
            const failTransition: WorkflowTransitionInput = {
              reasonCode: 'max_node_attempts_exceeded',
              evidenceRefs: [],
            };
            const failState = await this.engine.completeNode(runId, nodeId, failTransition);
            currentState = failState;
            nodeResults.set(nodeId, {
              nodeDefinitionId: nodeId,
              executionMode: 'dispatched',
            });
            await this.observer?.event('harness:node_failed', {
              runId,
              nodeDefinitionId: nodeId,
              reasonCode: 'max_node_attempts_exceeded',
            });
            return;
          }

          const nodeType = derivedNode.definition.type as WorkflowNodeKind;
          const mapping = WORKFLOW_NODE_DISPATCH_MAP[nodeType];
          if (!mapping) return;

          await this.observer?.event('harness:node_dispatched', {
            runId,
            nodeDefinitionId: nodeId,
            executionMode: 'dispatched',
            agentClass: mapping.agentClass,
          });

          const startMs = Date.now();
          let agentResult: AgentResult;

          try {
            if (nodeType === 'subworkflow') {
              agentResult = await this.dispatchOrchestrator(
                {
                  dispatchIntent: {
                    type: 'skill' as const,
                    skillRef: derivedNode.definition.name,
                    context: {},
                  },
                  taskInstructions: `Execute subworkflow node: ${derivedNode.definition.name}`,
                },
                lifecycleContext,
              );
            } else {
              agentResult = await this.dispatchWorker(
                {
                  taskInstructions: `Execute workflow node: ${derivedNode.definition.name} (${nodeType})`,
                  nodeDefinitionId: nodeId,
                },
                lifecycleContext,
              );
            }
          } catch {
            // Dispatch threw — treat as node failure
            const failTransition: WorkflowTransitionInput = {
              reasonCode: 'dispatch_exception',
              evidenceRefs: [],
            };
            const failState = await this.engine.completeNode(runId, nodeId, failTransition);
            currentState = failState;
            nodeResults.set(nodeId, {
              nodeDefinitionId: nodeId,
              executionMode: 'dispatched',
            });
            await this.observer?.event('harness:node_failed', {
              runId,
              nodeDefinitionId: nodeId,
              reasonCode: 'dispatch_exception',
              durationMs: Date.now() - startMs,
            });
            return;
          }

          // Handle suspended agents — mark as waiting
          if (agentResult.status === 'suspended') {
            await this.observer?.event('harness:node_completed', {
              runId,
              nodeDefinitionId: nodeId,
              outcome: 'waiting',
              durationMs: Date.now() - startMs,
            });
            nodeResults.set(nodeId, {
              nodeDefinitionId: nodeId,
              executionMode: 'dispatched',
              agentResult,
              usage: agentResult.usage
                ? { tokensUsed: agentResult.usage.tokensUsed }
                : undefined,
            });
            return;
          }

          // Map agent result to node outcome
          const outcome = mapAgentResultToNodeOutcome(agentResult);
          const transition: WorkflowTransitionInput = {
            reasonCode: outcome.reasonCode,
            evidenceRefs: [],
          };

          const newState = await this.engine.completeNode(runId, nodeId, transition);
          currentState = newState;

          // Accumulate token usage
          if (agentResult.usage) {
            totalUsage.inputTokens += agentResult.usage.tokensUsed ?? 0;
            totalUsage.totalTokens += agentResult.usage.tokensUsed ?? 0;
          }

          nodeResults.set(nodeId, {
            nodeDefinitionId: nodeId,
            executionMode: 'dispatched',
            agentResult,
            usage: agentResult.usage
              ? { tokensUsed: agentResult.usage.tokensUsed }
              : undefined,
          });

          await this.observer?.event(
            outcome.status === 'completed' ? 'harness:node_completed' : 'harness:node_failed',
            {
              runId,
              nodeDefinitionId: nodeId,
              outcome: outcome.status,
              reasonCode: outcome.reasonCode,
              agentStatus: agentResult.status,
              durationMs: Date.now() - startMs,
            },
          );
        });

        await Promise.allSettled(dispatchPromises);
      }

      // Refresh state from engine after all dispatches
      const refreshedState = await this.engine.getState(runId);
      if (refreshedState) {
        currentState = refreshedState;
      }

      // Check terminal status
      if (
        currentState.status === 'completed' ||
        currentState.status === 'failed' ||
        currentState.status === 'canceled'
      ) {
        break;
      }
    }

    await this.observer?.event('harness:run_completed', {
      runId,
      status: currentState.status,
      totalNodes: nodeResults.size,
      totalUsage,
    });

    return {
      finalRunState: currentState,
      nodeResults,
      totalUsage,
      suspended: false,
    };
  }

  private batchNodes(
    nodes: WorkflowNodeDefinitionId[],
    batchSize: number,
  ): WorkflowNodeDefinitionId[][] {
    const batches: WorkflowNodeDefinitionId[][] = [];
    for (let i = 0; i < nodes.length; i += batchSize) {
      batches.push(nodes.slice(i, i + batchSize));
    }
    return batches;
  }
}
