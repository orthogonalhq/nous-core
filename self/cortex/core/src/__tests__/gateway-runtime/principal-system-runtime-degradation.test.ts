import { describe, expect, it, vi } from 'vitest';
import type { ProjectId } from '@nous/shared';
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
  systemOutputs?: string[];
}) {
  return createPrincipalSystemGatewayRuntime({
    documentStore: createDocumentStore(),
    modelProviderByClass: {
      'Cortex::Principal': createModelProvider(
        ['{"response":"idle","toolCalls":[]}'],
      ),
      'Cortex::System': createModelProvider(
        args?.systemOutputs ?? [
          JSON.stringify({
            response: '',
            toolCalls: [
              { name: 'task_complete', params: { output: {}, summary: 'done' } },
            ],
          }),
        ],
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
    // No recovery deps, no opctlService — all undefined
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

describe('PrincipalSystemGatewayRuntime — graceful degradation (Phase 1.2)', () => {
  it('operates correctly when checkpointManager is undefined — no checkpoint operations, no errors', async () => {
    const runtime = createRuntime();

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.lastResultStatus).toBe('completed');
    expect(runtime.getCheckpointStatus().lastPreparedCheckpointId).toBeUndefined();
    expect(runtime.getCheckpointStatus().lastCommittedCheckpointId).toBeUndefined();
  });

  it('operates correctly when recoveryOrchestrator is undefined — no recovery invocation on error', async () => {
    const runtime = createRuntime();

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.lastResultStatus).toBe('completed');
  });

  it('operates correctly when opctlService is undefined — no gate check', async () => {
    const runtime = createRuntime();

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');
    expect(health.lastResultStatus).toBe('completed');
  });

  it('combined — no recovery deps and no opctl yields identical behavior to pre-Phase 1.2', async () => {
    const runtime = createRuntime();

    // Verify boot is normal
    expect(runtime.getBootSnapshot().status).toBe('ready');
    expect(runtime.getBootSnapshot().completedSteps).toEqual([
      'subcortex_initialized',
      'internal_mcp_registered',
      'principal_booted',
      'system_booted',
      'inbox_exchange_ready',
    ]);

    // Submit and verify execution
    await runtime.submitTaskToSystem({
      task: 'Review project status',
      projectId: PROJECT_ID as unknown as string,
      detail: { source: 'test' },
    });
    await runtime.whenIdle();

    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.lastResultStatus).toBe('completed');
    expect(health.issueCodes).not.toContain('opctl_gate_blocked');

    // Verify no checkpoint or escalation data
    expect(runtime.getCheckpointStatus().lastPreparedCheckpointId).toBeUndefined();
    expect(runtime.getEscalationAuditSummary().escalationCount).toBe(0);
  });

  it('runtime operates correctly when recoveryLedgerStore is undefined — recovery not invoked', async () => {
    const runtime = createRuntime();

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    // Execution completes normally without recovery
    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.lastResultStatus).toBe('completed');
  });
});
