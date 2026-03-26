import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  ProjectId,
  WorkflowDefinition,
  WorkflowDefinitionId,
  WorkflowEdgeId,
  WorkflowNodeDefinitionId,
} from '@nous/shared';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { createProjectConfig } from '../../test-support/project-fixtures';

const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655443002' as WorkflowDefinitionId;
const NODE_A = '550e8400-e29b-41d4-a716-446655443003' as WorkflowNodeDefinitionId;
const NODE_B = '550e8400-e29b-41d4-a716-446655443004' as WorkflowNodeDefinitionId;
const EDGE_ID = '550e8400-e29b-41d4-a716-446655443005' as WorkflowEdgeId;

function createWorkflow(projectId: ProjectId): WorkflowDefinition {
  return {
    id: WORKFLOW_ID,
    projectId,
    mode: 'hybrid',
    version: '1.0.0',
    name: 'MAO Router Workflow',
    entryNodeIds: [NODE_A],
    nodes: [
      {
        id: NODE_A,
        name: 'Draft',
        type: 'model-call',
        governance: 'must',
        executionModel: 'synchronous',
        outputSchemaRef: 'schema://mao-router/draft-output',
        config: {
          type: 'model-call',
          modelRole: 'reasoner',
          promptRef: 'prompt://draft',
        },
      },
      {
        id: NODE_B,
        name: 'Review',
        type: 'human-decision',
        governance: 'must',
        executionModel: 'synchronous',
        config: {
          type: 'human-decision',
          decisionRef: 'decision://review',
        },
      },
    ],
    edges: [
      {
        id: EDGE_ID,
        from: NODE_A,
        to: NODE_B,
        priority: 0,
      },
    ],
  };
}

async function createProjectWithWorkflow(ctx: ReturnType<typeof createNousContext>) {
  const projectId = randomUUID() as ProjectId;
  await ctx.projectStore.create(
    createProjectConfig({
      id: projectId,
      name: 'MAO Router Project',
      workflow: {
        defaultWorkflowDefinitionId: WORKFLOW_ID,
        definitions: [createWorkflow(projectId)],
        packageBindings: [],
      },
    }),
  );
  return projectId;
}

describe('mao router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-mao-router-${randomUUID()}`);
    clearNousContextCache();
  });

  it('returns MAO snapshots, inspect projections, and graph lineage from canonical runtime truth', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProjectWithWorkflow(ctx);
    const sessionId = randomUUID();
    await caller.voice.beginTurn({
      turn_id: randomUUID(),
      session_id: sessionId,
      project_id: projectId,
      principal_id: 'principal',
      channel: 'web',
      evidence_refs: ['voice:turn'],
    });

    const started = await ctx.workflowEngine.start({
      projectConfig: (await ctx.projectStore.get(projectId))!,
      runId: randomUUID() as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
      startedAt: '2026-03-10T01:00:00.000Z',
    });
    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    const afterFirstNode = await ctx.workflowEngine.completeNode(
      started.runState.runId,
      NODE_A,
      {
        reasonCode: 'node_completed',
        evidenceRefs: ['workflow:complete:a'],
      },
    );
    expect(afterFirstNode.readyNodeIds).toEqual([NODE_B]);

    const snapshot = await caller.mao.getProjectSnapshot({
      projectId,
      densityMode: 'D3',
    });
    expect(snapshot.grid.length).toBeGreaterThan(0);
    expect(snapshot.graph.edges.some((edge) => edge.kind === 'dispatch')).toBe(true);

    const inspect = await caller.mao.getAgentInspectProjection({
      projectId,
      workflowRunId: snapshot.workflowRunId,
      agentId: snapshot.grid[0]!.agent.agent_id,
    });
    expect(inspect?.agent.project_id).toBe(projectId);

    const graph = await caller.mao.getRunGraphSnapshot({
      projectId,
      workflowRunId: snapshot.workflowRunId,
      densityMode: 'D2',
    });
    expect(graph.nodes.length).toBe(snapshot.graph.nodes.length);
  });

  it('applies project-scope pause and resume through the MAO router', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProjectWithWorkflow(ctx);
    const sessionId = randomUUID();

    await caller.voice.beginTurn({
      turn_id: randomUUID(),
      session_id: sessionId,
      project_id: projectId,
      principal_id: 'principal',
      channel: 'web',
      evidence_refs: ['voice:turn'],
    });

    const pause = await caller.mao.requestProjectControl({
      request: {
        command_id: '550e8400-e29b-41d4-a716-446655443101',
        project_id: projectId,
        action: 'pause_project',
        actor_id: 'principal-operator',
        actor_type: 'operator',
        reason: 'Pause for review',
        requested_at: '2026-03-10T01:10:00.000Z',
        impactSummary: {
          activeRunCount: 0,
          activeAgentCount: 0,
          blockedAgentCount: 0,
          urgentAgentCount: 0,
          affectedScheduleCount: 0,
          evidenceRefs: ['evidence://pause'],
        },
      },
    });
    expect(pause.accepted).toBe(true);
    expect(pause.to_state).toBe('paused_review');

    // Obtain confirmation proof for T3 action (resume_project)
    const proof = await caller.opctl.requestConfirmationProof({
      scope: {
        class: 'project_run_scope',
        kind: 'project_run',
        target_ids: [],
        project_id: projectId,
      },
      action: 'resume',
      tier: 'T3',
      reason: 'Resume after review',
    });

    const resume = await caller.mao.requestProjectControl({
      request: {
        command_id: '550e8400-e29b-41d4-a716-446655443102',
        project_id: projectId,
        action: 'resume_project',
        actor_id: 'principal-operator',
        actor_type: 'operator',
        reason: 'Resume after review',
        requested_at: '2026-03-10T01:11:00.000Z',
        impactSummary: {
          activeRunCount: 0,
          activeAgentCount: 0,
          blockedAgentCount: 0,
          urgentAgentCount: 0,
          affectedScheduleCount: 0,
          evidenceRefs: ['evidence://resume'],
        },
      },
      confirmationProof: proof,
    });
    expect(resume.accepted).toBe(true);
    expect(resume.to_state).toBe('running');
    expect(resume.readiness_status).toBe('passed');

    const controlProjection = await caller.mao.getProjectControlProjection({
      projectId,
    });
    expect(controlProjection?.project_last_control_action).toBe('resume_project');
    expect(controlProjection?.resume_readiness_status).toBe('passed');
    expect(controlProjection?.voice_projection?.current_turn_state).toBe('listening');
  });
});
