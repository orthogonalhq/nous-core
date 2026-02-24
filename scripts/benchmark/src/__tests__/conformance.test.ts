import { describe, it, expect } from 'vitest';
import { MockAdapter } from '../adapters/mock-adapter.js';
import { PrepareInputSchema } from '@nous/shared';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

const validRunEnvelope = {
  benchmark_id: 'nodeflow-smoke',
  benchmark_version: '1.0.0',
  task_id: 'task-001',
  run_id: RUN_ID,
  seed: 'seed-123',
  project_id: 'proj-001',
  target_agent_id: 'mock-agent',
  target_agent_version: '1.0.0',
  adapter_id: 'mock-adapter',
  capability_profile: 'default',
  started_at: NOW,
};

describe('MockAdapter conformance', () => {
  const adapter = new MockAdapter();

  it('schema validation: PrepareInput/Output parse correctly', async () => {
    const input = {
      run: validRunEnvelope,
      task_payload: {},
      environment_profile: 'default',
    };
    PrepareInputSchema.parse(input);
    const output = await adapter.prepare(input);
    expect(output.prepared).toBe(true);
    expect(output.prepared_at).toBeDefined();
  });

  it('lifecycle ordering: prepare -> execute -> capture -> cleanup', async () => {
    const run = validRunEnvelope;
    await adapter.prepare({
      run,
      task_payload: {},
      environment_profile: 'default',
    });
    const execOutput = await adapter.execute({ run });
    expect(execOutput.completion_status).toBe('success');

    const captureInput = { run };
    const trace = await adapter.captureTrace(captureInput);
    const sideEffects = await adapter.captureSideEffects(captureInput);
    const artifacts = await adapter.collectArtifacts(captureInput);

    expect(trace.run_id).toBe(RUN_ID);
    expect(artifacts.evidence_bundle_ref).toBeDefined();
    expect(artifacts.evidence_bundle_ref.length).toBeGreaterThan(0);

    const cleanupOutput = await adapter.cleanup({ run });
    expect(cleanupOutput.cleaned).toBe(true);
  });

  it('idempotency: repeated capture calls return consistent results', async () => {
    const run = validRunEnvelope;
    await adapter.prepare({
      run,
      task_payload: {},
      environment_profile: 'default',
    });
    await adapter.execute({ run });

    const captureInput = { run };
    const artifacts1 = await adapter.collectArtifacts(captureInput);
    const artifacts2 = await adapter.collectArtifacts(captureInput);

    expect(artifacts1.evidence_bundle_ref).toBe(artifacts2.evidence_bundle_ref);
    expect(artifacts1.artifacts.length).toBe(artifacts2.artifacts.length);

    await adapter.cleanup({ run });
  });

  it('evidence bundle completeness: artifacts include evidence_bundle_ref', async () => {
    const run = validRunEnvelope;
    await adapter.prepare({
      run,
      task_payload: {},
      environment_profile: 'default',
    });
    await adapter.execute({ run });
    const artifacts = await adapter.collectArtifacts({ run });
    await adapter.cleanup({ run });

    expect(artifacts.evidence_bundle_ref).toBeDefined();
    expect(artifacts.evidence_bundle_ref.length).toBeGreaterThan(0);
  });

  it('timestamp monotonicity: trace events have non-decreasing ts', async () => {
    const run = validRunEnvelope;
    await adapter.prepare({
      run,
      task_payload: {},
      environment_profile: 'default',
    });
    await adapter.execute({ run });
    const trace = await adapter.captureTrace({ run });
    await adapter.cleanup({ run });

    for (let i = 1; i < trace.events.length; i++) {
      const prev = new Date(trace.events[i - 1].ts).getTime();
      const curr = new Date(trace.events[i].ts).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});
