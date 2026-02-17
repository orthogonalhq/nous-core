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

  it('start() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.start('00000000-0000-0000-0000-000000000001' as any, {} as any),
      'IWorkflowEngine',
    );
  });

  it('resume() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.resume('00000000-0000-0000-0000-000000000001' as any),
      'IWorkflowEngine',
    );
  });

  it('pause() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.pause('00000000-0000-0000-0000-000000000001' as any),
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
      () => stub.retrieve('00000000-0000-0000-0000-000000000001' as any),
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
      () => stub.delete('00000000-0000-0000-0000-000000000001' as any),
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
  const stub = new StubSandbox();

  it('execute() throws NousError with code NOT_IMPLEMENTED', async () => {
    await assertNotImplemented(
      () => stub.execute({} as any),
      'ISandbox',
    );
  });

  it('hasCapability() throws NousError with code NOT_IMPLEMENTED', () => {
    assertNotImplementedSync(() => stub.hasCapability('read'), 'ISandbox');
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
