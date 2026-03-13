import { describe, expect, it, vi } from 'vitest';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import {
  AGENT_ID,
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
});
