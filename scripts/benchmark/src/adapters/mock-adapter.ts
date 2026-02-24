/**
 * Mock adapter for Tier 0 deterministic benchmark runs and conformance tests.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 */
import { randomUUID } from 'node:crypto';
import type {
  AgentAdapter,
  AdapterMetadata,
  PrepareInput,
  PrepareOutput,
  ExecuteInput,
  ExecuteOutput,
  CaptureInput,
  TraceBundle,
  SideEffectBundle,
  ArtifactBundle,
  CleanupInput,
  CleanupOutput,
} from '@nous/shared';
import {
  PrepareOutputSchema,
  ExecuteOutputSchema,
  TraceBundleSchema,
  SideEffectBundleSchema,
  ArtifactBundleSchema,
  CleanupOutputSchema,
} from '@nous/shared';

const ADAPTER_ID = 'mock-adapter';
const TARGET_AGENT_ID = 'mock-agent';

export const mockAdapterMetadata: AdapterMetadata = {
  adapter_id: ADAPTER_ID,
  adapter_version: '1.0.0',
  target_agent_name: 'Mock Agent',
  target_agent_version: '1.0.0',
  supports: {
    tools: true,
    multimodal_image: false,
    memory_ops: true,
    workflow_dag: true,
  },
};

/**
 * Mock adapter that satisfies the AgentAdapter contract for conformance tests
 * and Tier 0 deterministic runs.
 */
export class MockAdapter implements AgentAdapter {
  readonly metadata = mockAdapterMetadata;

  async prepare(input: PrepareInput): Promise<PrepareOutput> {
    const output: PrepareOutput = {
      prepared: true,
      prepared_at: new Date().toISOString(),
    };
    PrepareOutputSchema.parse(output);
    return output;
  }

  async execute(input: ExecuteInput): Promise<ExecuteOutput> {
    const now = new Date().toISOString();
    const output: ExecuteOutput = {
      completion_status: 'success',
      time_to_success_ms: 100,
      intervention_events: 0,
      policy_events: 0,
      finished_at: now,
    };
    ExecuteOutputSchema.parse(output);
    return output;
  }

  async captureTrace(input: CaptureInput): Promise<TraceBundle> {
    const runId = input.run.run_id;
    const now = new Date().toISOString();
    const bundle: TraceBundle = {
      run_id: runId,
      events: [
        { ts: now, phase: 'prepare', type: 'info', message: 'Prepared', run_id: runId },
        { ts: now, phase: 'execute', type: 'info', message: 'Executed', run_id: runId },
      ],
    };
    TraceBundleSchema.parse(bundle);
    return bundle;
  }

  async captureSideEffects(input: CaptureInput): Promise<SideEffectBundle> {
    const runId = input.run.run_id;
    const bundle: SideEffectBundle = {
      run_id: runId,
      events: [],
    };
    SideEffectBundleSchema.parse(bundle);
    return bundle;
  }

  async collectArtifacts(input: CaptureInput): Promise<ArtifactBundle> {
    const runId = input.run.run_id;
    const evidenceRef = `mock-evidence-${runId}`;
    const bundle: ArtifactBundle = {
      run_id: runId,
      artifacts: [],
      evidence_bundle_ref: evidenceRef,
    };
    ArtifactBundleSchema.parse(bundle);
    return bundle;
  }

  async cleanup(input: CleanupInput): Promise<CleanupOutput> {
    const output: CleanupOutput = {
      cleaned: true,
      cleaned_at: new Date().toISOString(),
    };
    CleanupOutputSchema.parse(output);
    return output;
  }
}
