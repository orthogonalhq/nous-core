import { describe, expect, it, vi } from 'vitest';
import type { IOpctlService, ProjectId } from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import {
  AGENT_ID,
  createDocumentStore,
  createModelProvider,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

const PROJECT_ID = AGENT_ID as unknown as ProjectId;

function createRuntime(args?: {
  opctlService?: IOpctlService;
  systemOutputs?: string[];
}) {
  return createPrincipalSystemGatewayRuntime({
    documentStore: createDocumentStore(),
    modelProviderByClass: {
      'Cortex::Principal': createModelProvider(
        ['{"response":"idle","toolCalls":[]}'],
      ),
      'Cortex::System': createModelProvider(
        args?.systemOutputs ?? ['{"response":"idle","toolCalls":[]}'],
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
    opctlService: args?.opctlService,
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

function createOpctlService(
  controlState: 'running' | 'paused_review' | 'hard_stopped' | 'resuming',
): IOpctlService {
  return {
    getProjectControlState: vi.fn().mockResolvedValue(controlState),
    executeCommand: vi.fn(),
    getCommandHistory: vi.fn().mockResolvedValue([]),
    validateCommand: vi.fn().mockResolvedValue({ valid: true }),
  } as unknown as IOpctlService;
}

describe('PrincipalSystemGatewayRuntime — opctl gate (Phase 1.2)', () => {
  it('blocks principal_tool source when project is paused_review', async () => {
    const opctlService = createOpctlService('paused_review');
    const runtime = createRuntime({ opctlService });

    await runtime.submitTaskToSystem({
      task: 'Review something',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).toContain('opctl_gate_blocked');
  });

  it('blocks principal_tool source when project is hard_stopped', async () => {
    const opctlService = createOpctlService('hard_stopped');
    const runtime = createRuntime({ opctlService });

    await runtime.submitTaskToSystem({
      task: 'Review something',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).toContain('opctl_gate_blocked');
  });

  it('allows principal_tool source when project state is running', async () => {
    const opctlService = createOpctlService('running');
    const runtime = createRuntime({
      opctlService,
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Review something',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');
    expect(health.lastResultStatus).toBe('completed');
  });

  it('allows principal_tool source when project state is resuming', async () => {
    const opctlService = createOpctlService('resuming');
    const runtime = createRuntime({
      opctlService,
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Review something',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');
    expect(health.lastResultStatus).toBe('completed');
  });

  it('scheduler source bypasses gate regardless of project control state', async () => {
    const opctlService = createOpctlService('hard_stopped');
    const runtime = createRuntime({
      opctlService,
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitIngressEnvelope({
      trigger_id: '550e8400-e29b-41d4-a716-446655440200',
      trigger_type: 'scheduler',
      event_name: 'cron.tick',
      project_id: PROJECT_ID as unknown as string,
      workmode_id: 'system:implementation',
      payload: {},
      workflow_ref: 'test-workflow',
      authn_identity: { identity_type: 'system', identity_ref: 'cortex:scheduler' },
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');
    expect(health.lastResultStatus).toBe('completed');
  });

  it('system_event source bypasses gate regardless of project control state', async () => {
    const opctlService = createOpctlService('paused_review');
    const runtime = createRuntime({
      opctlService,
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitIngressEnvelope({
      trigger_id: '550e8400-e29b-41d4-a716-446655440201',
      trigger_type: 'system_event',
      event_name: 'project.updated',
      project_id: PROJECT_ID as unknown as string,
      workmode_id: 'system:implementation',
      payload: {},
      workflow_ref: 'test-workflow',
      authn_identity: { identity_type: 'system', identity_ref: 'cortex:events' },
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');
    expect(health.lastResultStatus).toBe('completed');
  });

  it('hook source bypasses gate regardless of project control state', async () => {
    const opctlService = createOpctlService('hard_stopped');
    const runtime = createRuntime({
      opctlService,
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitIngressEnvelope({
      trigger_id: '550e8400-e29b-41d4-a716-446655440202',
      trigger_type: 'hook' as 'scheduler',
      event_name: 'webhook.received',
      project_id: PROJECT_ID as unknown as string,
      workmode_id: 'system:implementation',
      payload: {},
      workflow_ref: 'test-workflow',
      authn_identity: { identity_type: 'system', identity_ref: 'cortex:hooks' },
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');
  });

  it('opctl service error does not block execution (fail-open)', async () => {
    const opctlService = {
      getProjectControlState: vi.fn().mockRejectedValue(new Error('service unavailable')),
      executeCommand: vi.fn(),
      getCommandHistory: vi.fn().mockResolvedValue([]),
      validateCommand: vi.fn().mockResolvedValue({ valid: true }),
    } as unknown as IOpctlService;

    const runtime = createRuntime({
      opctlService,
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Review something',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');
    expect(health.lastResultStatus).toBe('completed');
  });

  it('no opctl check when opctlService is undefined (graceful degradation)', async () => {
    const runtime = createRuntime({
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Review something',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');
    expect(health.lastResultStatus).toBe('completed');
  });
});
