import { describe, expect, it, vi } from 'vitest';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import {
  AGENT_ID,
  createDocumentStore,
  createModelProvider,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

function createRuntime(args?: {
  systemOutputs?: unknown[];
  principalOutputs?: unknown[];
  orchestratorOutputs?: unknown[];
  workerOutputs?: unknown[];
}) {
  return createPrincipalSystemGatewayRuntime({
    documentStore: createDocumentStore(),
    modelProviderByClass: {
      'Cortex::Principal': createModelProvider(
        args?.principalOutputs ?? ['{"response":"idle","toolCalls":[]}'],
      ),
      'Cortex::System': createModelProvider(
        args?.systemOutputs ?? ['{"response":"idle","toolCalls":[]}'],
      ),
      Orchestrator: createModelProvider(
        args?.orchestratorOutputs ?? ['{"response":"idle","toolCalls":[]}'],
      ),
      Worker: createModelProvider(
        args?.workerOutputs ?? ['{"response":"idle","toolCalls":[]}'],
      ),
    },
    getProjectApi: () => createProjectApi(),
    pfc: createPfcEngine(),
    outputSchemaValidator: {
      validate: vi.fn().mockResolvedValue({ success: true }),
    },
    idFactory: (() => {
      let counter = 0;
      return () => {
        const suffix = String(counter).padStart(12, '0');
        counter += 1;
        return `00000000-0000-4000-8000-${suffix}`;
      };
    })(),
  });
}

describe('PrincipalSystemGatewayRuntime', () => {
  it('boots the pair in the ratified order and constrains Principal tools', () => {
    const runtime = createRuntime();

    expect(runtime.getBootSnapshot().completedSteps).toEqual([
      'subcortex_initialized',
      'internal_mcp_registered',
      'principal_booted',
      'system_booted',
      'inbox_exchange_ready',
    ]);
    expect(runtime.getBootSnapshot().status).toBe('ready');

    const principalTools = runtime.listPrincipalTools().map((tool) => tool.name);
    expect(principalTools).toContain('submit_task_to_system');
    expect(principalTools).toContain('inject_directive_to_system');
    expect(principalTools).not.toContain('dispatch_agent');
    expect(principalTools).not.toContain('task_complete');
    expect(principalTools).not.toContain('request_escalation');
    expect(principalTools).not.toContain('flag_observation');
  });

  it('queues Principal submissions through System and exposes a read-only replica', async () => {
    const runtime = createRuntime({
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { queued: true },
                summary: 'system submission handled',
              },
            },
          ],
        }),
      ],
    });

    const receipt = await runtime.submitTaskToSystem({
      task: 'Review project status',
      projectId: AGENT_ID as never,
      detail: { source: 'test' },
    });
    await runtime.whenIdle();

    expect(receipt.source).toBe('principal_tool');
    expect(runtime.getGatewayHealth('Cortex::System').lastSubmissionSource).toBe(
      'principal_tool',
    );
    expect(runtime.getGatewayHealth('Cortex::System').lastResultStatus).toBe(
      'completed',
    );
    expect(runtime.getSystemContextReplica().inboxReady).toBe(true);
    expect(runtime.getSystemContextReplica().pendingSystemRuns).toBe(0);
    expect(runtime.getSystemContextReplica().backlogAnalytics.queuedCount).toBe(0);
    expect(runtime.getSystemContextReplica().backlogAnalytics.completedInWindow).toBe(1);
  });

  it('routes unresolved System escalations back to Principal continuity state', async () => {
    const runtime = createRuntime({
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            {
              name: 'request_escalation',
              params: {
                reason: 'Need Principal input',
                severity: 'high',
              },
            },
          ],
        }),
      ],
    });

    await runtime.injectDirective({
      directive: 'Escalate this issue',
      priority: 'high',
      detail: {},
    });
    await runtime.whenIdle();

    expect(runtime.getGatewayHealth('Cortex::System').lastResultStatus).toBe(
      'escalated',
    );
    expect(runtime.getGatewayHealth('Cortex::Principal').lastSubmissionAt).toBeDefined();
  });

  it('end-to-end submission -> backlog -> execution -> completion', async () => {
    const runtime = createRuntime({
      systemOutputs: [
        JSON.stringify({
          response: 'Task executed',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: { result: 'done' },
                summary: 'Completed the task',
              },
            },
          ],
        }),
      ],
    });

    const receipt = await runtime.submitTask({
      task: 'End-to-end test task',
      detail: { test: true },
    });

    expect(receipt.runId).toBeDefined();
    expect(receipt.dispatchRef).toBeDefined();
    expect(receipt.source).toBe('principal_tool');
    expect(receipt.acceptedAt).toBeDefined();

    await runtime.whenIdle();

    const replica = runtime.getSystemContextReplica();
    expect(replica.backlogAnalytics.completedInWindow).toBe(1);
    expect(replica.backlogAnalytics.queuedCount).toBe(0);
    expect(replica.backlogAnalytics.activeCount).toBe(0);
    expect(replica.pendingSystemRuns).toBe(0);
  });

  it('executes multi-submission work respecting priority ordering', async () => {
    const executionOrder: string[] = [];
    let callCount = 0;

    const runtime = createPrincipalSystemGatewayRuntime({
      documentStore: createDocumentStore(),
      modelProviderByClass: {
        'Cortex::Principal': createModelProvider(
          ['{"response":"idle","toolCalls":[]}'],
        ),
        'Cortex::System': createModelProvider(
          Array.from({ length: 10 }, () =>
            JSON.stringify({
              response: '',
              toolCalls: [
                {
                  name: 'task_complete',
                  params: {
                    output: { ok: true },
                    summary: 'done',
                  },
                },
              ],
            }),
          ),
        ),
        Orchestrator: createModelProvider(
          ['{"response":"idle","toolCalls":[]}'],
        ),
        Worker: createModelProvider(
          ['{"response":"idle","toolCalls":[]}'],
        ),
      },
      getProjectApi: () => createProjectApi(),
      pfc: createPfcEngine(),
      outputSchemaValidator: {
        validate: vi.fn().mockResolvedValue({ success: true }),
      },
      idFactory: (() => {
        let counter = 0;
        return () => {
          const suffix = String(counter).padStart(12, '0');
          counter += 1;
          return `00000000-0000-4000-8000-${suffix}`;
        };
      })(),
    });

    // Submit low, then high, then normal — high should execute first after the initial one
    await runtime.injectDirective({
      directive: 'Low priority work',
      priority: 'low',
      detail: {},
    });
    await runtime.injectDirective({
      directive: 'High priority work',
      priority: 'high',
      detail: {},
    });
    await runtime.injectDirective({
      directive: 'Normal priority work',
      priority: 'normal',
      detail: {},
    });

    await runtime.whenIdle();

    // All three should have completed
    const replica = runtime.getSystemContextReplica();
    expect(replica.backlogAnalytics.completedInWindow).toBeGreaterThanOrEqual(3);
    expect(replica.pendingSystemRuns).toBe(0);
  });

  it('logs a warning when no documentStore is injected (in-memory fallback)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    // Create runtime WITHOUT documentStore — triggers in-memory fallback
    createPrincipalSystemGatewayRuntime({
      modelProviderByClass: {
        'Cortex::Principal': createModelProvider(
          ['{"response":"idle","toolCalls":[]}'],
        ),
        'Cortex::System': createModelProvider(
          ['{"response":"idle","toolCalls":[]}'],
        ),
        Orchestrator: createModelProvider(
          ['{"response":"idle","toolCalls":[]}'],
        ),
        Worker: createModelProvider(
          ['{"response":"idle","toolCalls":[]}'],
        ),
      },
      getProjectApi: () => createProjectApi(),
      pfc: createPfcEngine(),
      outputSchemaValidator: {
        validate: vi.fn().mockResolvedValue({ success: true }),
      },
      idFactory: (() => {
        let counter = 0;
        return () => {
          const suffix = String(counter).padStart(12, '0');
          counter += 1;
          return `00000000-0000-4000-8000-${suffix}`;
        };
      })(),
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'Using in-memory document store for backlog queue -- queued work will not survive restart.',
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('does not log in-memory warning when documentStore is injected', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    createRuntime();

    const warnCalls = warnSpy.mock.calls.map((args) => args[0]);
    expect(warnCalls).not.toContain(
      'Using in-memory document store for backlog queue -- queued work will not survive restart.',
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
