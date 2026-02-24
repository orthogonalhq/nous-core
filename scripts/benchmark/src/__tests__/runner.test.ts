import { describe, it, expect } from 'vitest';
import { run } from '../runner.js';
import { MockAdapter } from '../adapters/mock-adapter.js';
import { BenchmarkSpecSchema } from '@nous/shared';

describe('run', () => {
  it('invokes prepare -> execute -> capture -> cleanup and returns RunRecord, EvidenceBundle, ScoreReport', async () => {
    const spec = BenchmarkSpecSchema.parse({
      benchmark_id: 'nodeflow-smoke',
      benchmark_version: '1.0.0',
      task_id: 'task-001',
      task_payload: {},
      rubric: {},
      family: 'nodeflow',
    });

    const result = await run({
      spec,
      adapter: new MockAdapter(),
      seed: 'seed-123',
      projectId: 'proj-001',
      targetAgentId: 'mock-agent',
      targetAgentVersion: '1.0.0',
    });

    expect(result.runRecord).toBeDefined();
    expect(result.runRecord.run_id).toBeDefined();
    expect(result.runRecord.evidence_bundle_ref).toBeDefined();
    expect(result.runRecord.completion_status).toBe('success');

    expect(result.evidenceBundle).toBeDefined();
    expect(result.evidenceBundle.run_id).toBe(result.runRecord.run_id);
    expect(result.evidenceBundle.evidence_bundle_ref).toBe(
      result.runRecord.evidence_bundle_ref,
    );

    expect(result.scoreReport).toBeDefined();
    expect(result.scoreReport.gate_outcome).toBe('pass');
    expect(result.scoreReport.hard_gate_violations).toEqual([]);
  });
});
