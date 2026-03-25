/**
 * Coding agents tRPC router.
 *
 * Provides endpoints for dispatching coding tasks, querying agent sessions,
 * and bridging the coding agent pipeline to the UI.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { router, publicProcedure } from '../trpc';
import type { AgentSessionEntry } from '../../context';

export const codingAgentsRouter = router({
  /**
   * Dispatch a coding task as a workflow with a single `nous.agent.claude` node.
   *
   * Creates an in-memory agent session that the AgentPanel can poll, and
   * returns the session ID so the UI can track progress.
   */
  dispatchCodingTask: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        workingDirectory: z.string().optional(),
        allowedTools: z
          .array(z.string())
          .default(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sessionId = randomUUID();
      const workflowRunId = randomUUID();

      // Create agent session entry for panel tracking
      const session: AgentSessionEntry = {
        id: sessionId,
        workflowRunId,
        agentName: 'Claude Code',
        agentType: 'nous.agent.claude',
        status: 'running',
        messages: [
          {
            id: randomUUID(),
            role: 'system',
            content: `Coding task dispatched: ${input.prompt.slice(0, 120)}`,
            timestamp: new Date().toISOString(),
          },
        ],
      };

      ctx.agentSessions.set(sessionId, session);

      // Build the workflow spec YAML for audit/replay purposes.
      // The actual execution is dispatched through the gateway runtime
      // as a System task, which routes to the workflow engine.
      const workflowYaml = buildCodingTaskWorkflowYaml({
        prompt: input.prompt,
        allowedTools: input.allowedTools,
        workingDirectory: input.workingDirectory,
      });

      // Dispatch to System gateway as a task. The System gateway
      // will create the workflow run and execute the agent node.
      const receipt = await ctx.gatewayRuntime.submitTaskToSystem({
        task: `Execute coding agent task: ${input.prompt.slice(0, 200)}`,
        detail: {
          sessionId,
          workflowRunId,
          workflowYaml,
          prompt: input.prompt,
          allowedTools: input.allowedTools,
          workingDirectory: input.workingDirectory,
        },
      });

      return {
        sessionId,
        workflowRunId,
        dispatchRef: receipt.dispatchRef,
        acceptedAt: receipt.acceptedAt,
      };
    }),

  /**
   * Get an agent session by ID.
   */
  getSession: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = ctx.agentSessions.get(input.sessionId);
      return session ?? null;
    }),

  /**
   * List all agent sessions (most recent first).
   */
  listSessions: publicProcedure.query(async ({ ctx }) => {
    return Array.from(ctx.agentSessions.values()).reverse();
  }),

  /**
   * Get agent session by workflow run ID.
   */
  getSessionByWorkflowRun: publicProcedure
    .input(z.object({ workflowRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      for (const session of ctx.agentSessions.values()) {
        if (session.workflowRunId === input.workflowRunId) {
          return session;
        }
      }
      return null;
    }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCodingTaskWorkflowYaml(params: {
  prompt: string;
  allowedTools: string[];
  workingDirectory?: string;
}): string {
  const escapedPrompt = params.prompt.replace(/'/g, "''");
  const toolList = params.allowedTools.map((t) => `      - ${t}`).join('\n');
  const workingDir = params.workingDirectory
    ? `\n        workingDirectory: '${params.workingDirectory.replace(/'/g, "''")}'`
    : '';

  return [
    'name: Coding Task',
    'version: 1',
    'nodes:',
    '  - id: agent-1',
    '    name: Claude Code',
    '    type: nous.agent.claude',
    '    position: [250, 300]',
    '    parameters:',
    `      prompt: '${escapedPrompt}'`,
    '      allowedTools:',
    toolList,
    workingDir,
    'connections: []',
  ]
    .filter(Boolean)
    .join('\n');
}
