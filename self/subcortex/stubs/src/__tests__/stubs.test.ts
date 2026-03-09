import { describe, it, expect } from 'vitest';
import { NousError } from '@nous/shared';
import {
  StubWorkflowEngine,
  StubArtifactStore,
  StubScheduler,
  StubEscalationService,
  StubSandbox,
  StubProjectApi,
} from '../stubs.js';

const assertNotImplemented = async (
  fn: () => Promise<unknown> | unknown,
  interfaceName: string,
) => {
  await expect(fn()).rejects.toThrow(NousError);
  try {
    await fn();
  } catch (e) {
    expect((e as NousError).code).toBe('NOT_IMPLEMENTED');
    expect((e as Error).message).toContain(interfaceName);
  }
};
// Helper for sync throws
const assertNotImplementedSync = (fn: () => unknown, interfaceName: string) => {
  try {
    fn();
    expect.fail('Should have thrown');
  } catch (e) {
    expect(e).toBeInstanceOf(NousError);
    expect((e as NousError).code).toBe('NOT_IMPLEMENTED');
    expect((e as Error).message).toContain(interfaceName);
  }
};

describe('StubWorkflowEngine', () => {
  const stub = new StubWorkflowEngine();

  it('resolveDefinition() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.resolveDefinition({} as any),
      'IWorkflowEngine',
    );
  });

  it('deriveGraph() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.deriveGraph({} as any),
      'IWorkflowEngine',
    );
  });

  it('evaluateAdmission() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.evaluateAdmission({} as any),
      'IWorkflowEngine',
    );
  });

  it('start() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.start({} as any),
      'IWorkflowEngine',
    );
  });

  it('resume() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () =>
        stub.resume('00000000-0000-0000-0000-000000000001' as any, {
          reasonCode: 'workflow_resumed',
          evidenceRefs: ['workflow:resume'],
        }),
      'IWorkflowEngine',
    );
  });

  it('pause() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () =>
        stub.pause('00000000-0000-0000-0000-000000000001' as any, {
          reasonCode: 'workflow_paused',
          evidenceRefs: ['workflow:pause'],
        }),
      'IWorkflowEngine',
    );
  });

  it('completeNode() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () =>
        stub.completeNode(
          '00000000-0000-0000-0000-000000000001' as any,
          '00000000-0000-0000-0000-000000000002' as any,
          {
            reasonCode: 'node_completed',
            evidenceRefs: ['workflow:complete'],
          },
        ),
      'IWorkflowEngine',
    );
  });

  it('executeReadyNode() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () =>
        stub.executeReadyNode({
          executionId: '00000000-0000-0000-0000-000000000001' as any,
          nodeDefinitionId: '00000000-0000-0000-0000-000000000002' as any,
          controlState: 'running',
          transition: {
            reasonCode: 'node_executed',
            evidenceRefs: ['workflow:execute'],
          },
        }),
      'IWorkflowEngine',
    );
  });

  it('continueNode() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () =>
        stub.continueNode({
          executionId: '00000000-0000-0000-0000-000000000001' as any,
          nodeDefinitionId: '00000000-0000-0000-0000-000000000002' as any,
          controlState: 'running',
          action: 'resume',
          transition: {
            reasonCode: 'node_resumed',
            evidenceRefs: ['workflow:resume'],
          },
        }),
      'IWorkflowEngine',
    );
  });

  it('getState() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.getState('00000000-0000-0000-0000-000000000001' as any),
      'IWorkflowEngine',
    );
  });
});

describe('StubArtifactStore', () => {
  const stub = new StubArtifactStore();

  it('store() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.store({} as any),
      'IArtifactStore',
    );
  });

  it('retrieve() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () =>
        stub.retrieve({
          projectId: '00000000-0000-0000-0000-000000000001' as any,
          artifactId: '00000000-0000-0000-0000-000000000002' as any,
        }),
      'IArtifactStore',
    );
  });

  it('list() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.list('00000000-0000-0000-0000-000000000001' as any),
      'IArtifactStore',
    );
  });

  it('delete() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () =>
        stub.delete({
          projectId: '00000000-0000-0000-0000-000000000001' as any,
          artifactId: '00000000-0000-0000-0000-000000000002' as any,
        }),
      'IArtifactStore',
    );
  });
});

describe('StubScheduler', () => {
  const stub = new StubScheduler();

  it('register() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.register({} as any),
      'IScheduler',
    );
  });

  it('cancel() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.cancel('schedule-1'),
      'IScheduler',
    );
  });

  it('list() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.list('00000000-0000-0000-0000-000000000001' as any),
      'IScheduler',
    );
  });
});

describe('StubEscalationService', () => {
  const stub = new StubEscalationService();

  it('notify() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.notify({} as any),
      'IEscalationService',
    );
  });

  it('checkResponse() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.checkResponse('00000000-0000-0000-0000-000000000001' as any),
      'IEscalationService',
    );
  });
});

describe('StubSandbox', () => {
  const createPayload = (overrides: Record<string, unknown> = {}) => ({
    source: 'export const run = () => "ok";',
    package_id: 'skill:image-quality-assessment',
    package_version: '1.0.0',
    package_type: 'skill',
    origin_class: 'third_party_external',
    declared_capabilities: ['model.invoke'],
    admission: {
      signature_valid: true,
      signer_known: true,
      api_compatible: true,
      policy_compatible: true,
      is_draft_unsigned: false,
      is_imported: false,
      reverification_complete: true,
      reapproval_complete: true,
    },
    action: {
      surface: 'model',
      action: 'invoke',
      requested_capability: 'model.invoke',
      requires_approval: true,
      direct_access_target: 'none',
    },
    runtime: {
      project_id: 'project-123',
      policy_profile: 'default',
      control_state: 'running',
    },
    capability_grant: {
      grant_id: 'grant-1',
      package_id: 'skill:image-quality-assessment',
      project_id: 'project-123',
      capability: 'model.invoke',
      approved_by: 'principal-1',
      confirmation_proof_ref: 'proof-1',
      nonce: 'nonce-1',
      issued_at: '2026-03-01T00:00:00.000Z',
      expires_at: '2026-03-01T01:00:00.000Z',
      scope: {
        action_surfaces: ['model'],
        action_names: ['invoke'],
      },
      status: 'active',
    },
    ...overrides,
  });

  it('execute() enforces membrane allow/deny behavior', async () => {
    const stub = new StubSandbox({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });

    const allowed = await stub.execute(createPayload() as any);
    expect(allowed.success).toBe(true);
    expect(allowed.decision.decision).toBe('allow');

    const denied = await stub.execute(
      createPayload({
        action: {
          surface: 'model',
          action: 'invoke',
          requested_capability: 'model.invoke',
          requires_approval: true,
          direct_access_target: 'network',
        },
      }) as any,
    );
    expect(denied.success).toBe(false);
    expect(denied.decision.decision).toBe('deny');
    expect(denied.decision.reason_code).toBe('PKG-003-DIRECT_ACCESS_DENIED');
  });

  it('execute() quarantines invalid signer posture', async () => {
    const stub = new StubSandbox({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });
    const result = await stub.execute(
      createPayload({
        admission: {
          signature_valid: true,
          signer_known: false,
          api_compatible: true,
          policy_compatible: true,
          is_draft_unsigned: false,
          is_imported: false,
          reverification_complete: true,
          reapproval_complete: true,
        },
      }) as any,
    );
    expect(result.success).toBe(false);
    expect(result.decision.decision).toBe('quarantine');
    expect(result.decision.reason_code).toBe('PKG-001-REVOKED_SIGNER');
  });

  it('execute() blocks replayed grant nonce attempts', async () => {
    const stub = new StubSandbox({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });
    const payload = createPayload();
    const first = await stub.execute(payload as any);
    const second = await stub.execute(payload as any);
    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.decision.reason_code).toBe('PKG-002-CAPABILITY_REPLAY_DETECTED');
  });

  it('hasCapability() respects configured and declared capabilities', () => {
    const stub = new StubSandbox({
      allowedCapabilities: ['model.invoke'],
    });
    expect(stub.hasCapability('model.invoke', ['model.invoke'])).toBe(true);
    expect(stub.hasCapability('model.invoke', ['tool.execute'])).toBe(false);
    expect(stub.hasCapability('tool.execute', ['tool.execute'])).toBe(false);
  });
});

describe('StubProjectApi', () => {
  const stub = new StubProjectApi();

  it('memory.read() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.memory.read('query', 'project'),
      'IProjectApi.memory',
    );
  });

  it('model.invoke() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.model.invoke('reasoner', {}),
      'IProjectApi.model',
    );
  });

  it('tool.execute() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.tool.execute('echo', {}),
      'IProjectApi.tool',
    );
  });

  it('project.config() throws NousError with code NOT_IMPLEMENTED', () => {
    assertNotImplementedSync(() => stub.project.config(), 'IProjectApi.project');
  });
});
