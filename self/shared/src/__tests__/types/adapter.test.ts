import { describe, it, expect } from 'vitest';
import {
  AdapterMetadataSchema,
  PrepareInputSchema,
  PrepareOutputSchema,
  ExecuteInputSchema,
  ExecuteOutputSchema,
  CaptureInputSchema,
  CleanupInputSchema,
  CleanupOutputSchema,
  AdapterErrorSchema,
} from '../../types/adapter.js';
import {
  RunEnvelopeSchema,
  TraceBundleSchema,
  SideEffectBundleSchema,
  ArtifactBundleSchema,
} from '../../types/benchmark.js';

const NOW = new Date().toISOString();
const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';

const validRunEnvelope = {
  benchmark_id: 'nodeflow-smoke',
  benchmark_version: '1.0.0',
  task_id: 'task-001',
  run_id: RUN_ID,
  seed: 'seed-123',
  project_id: 'proj-001',
  target_agent_id: 'openclaw',
  target_agent_version: '1.0.0',
  adapter_id: 'openclaw-adapter',
  capability_profile: 'default',
  started_at: NOW,
};

describe('AdapterMetadataSchema', () => {
  it('accepts valid metadata', () => {
    const result = AdapterMetadataSchema.safeParse({
      adapter_id: 'openclaw-adapter',
      adapter_version: '1.0.0',
      target_agent_name: 'OpenClaw',
      target_agent_version: '1.0.0',
      supports: {
        tools: true,
        multimodal_image: false,
        memory_ops: true,
        workflow_dag: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid adapter_id', () => {
    expect(
      AdapterMetadataSchema.safeParse({
        adapter_id: 'Invalid-Id',
        adapter_version: '1.0.0',
        target_agent_name: 'OpenClaw',
        target_agent_version: '1.0.0',
        supports: {
          tools: true,
          multimodal_image: false,
          memory_ops: true,
          workflow_dag: true,
        },
      }).success,
    ).toBe(false);
  });
});

describe('PrepareInputSchema', () => {
  it('accepts valid prepare input', () => {
    const result = PrepareInputSchema.safeParse({
      run: validRunEnvelope,
      task_payload: { key: 'value' },
      environment_profile: 'default',
    });
    expect(result.success).toBe(true);
  });
});

describe('PrepareOutputSchema', () => {
  it('accepts valid prepare output', () => {
    const result = PrepareOutputSchema.safeParse({
      prepared: true,
      prepared_at: NOW,
    });
    expect(result.success).toBe(true);
  });
});

describe('ExecuteInputSchema', () => {
  it('accepts valid execute input', () => {
    const result = ExecuteInputSchema.safeParse({
      run: validRunEnvelope,
    });
    expect(result.success).toBe(true);
  });
});

describe('ExecuteOutputSchema', () => {
  it('accepts valid execute output', () => {
    const result = ExecuteOutputSchema.safeParse({
      completion_status: 'success',
      time_to_success_ms: 1000,
      intervention_events: 0,
      policy_events: 0,
      finished_at: NOW,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all completion statuses', () => {
    for (const status of ['success', 'partial', 'failed', 'blocked'] as const) {
      expect(
        ExecuteOutputSchema.safeParse({
          completion_status: status,
          time_to_success_ms: 0,
          intervention_events: 0,
          policy_events: 0,
          finished_at: NOW,
        }).success,
      ).toBe(true);
    }
  });
});

describe('TraceBundleSchema', () => {
  it('accepts empty events', () => {
    const result = TraceBundleSchema.safeParse({
      run_id: RUN_ID,
      events: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid trace events', () => {
    const result = TraceBundleSchema.safeParse({
      run_id: RUN_ID,
      events: [
        {
          ts: NOW,
          phase: 'prepare',
          type: 'info',
          message: 'Prepared',
          run_id: RUN_ID,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('SideEffectBundleSchema', () => {
  it('accepts valid side effect bundle', () => {
    const result = SideEffectBundleSchema.safeParse({
      run_id: RUN_ID,
      events: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('ArtifactBundleSchema', () => {
  it('accepts valid artifact bundle with evidence_bundle_ref', () => {
    const result = ArtifactBundleSchema.safeParse({
      run_id: RUN_ID,
      artifacts: [],
      evidence_bundle_ref: 'evt-001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty evidence_bundle_ref', () => {
    expect(
      ArtifactBundleSchema.safeParse({
        run_id: RUN_ID,
        artifacts: [],
        evidence_bundle_ref: '',
      }).success,
    ).toBe(false);
  });
});

describe('AdapterErrorSchema', () => {
  it('accepts valid adapter error', () => {
    const result = AdapterErrorSchema.safeParse({
      code: 'capability_mismatch',
      phase: 'prepare',
      retriable: false,
      message: 'Missing capability',
      run_id: RUN_ID,
    });
    expect(result.success).toBe(true);
  });
});
