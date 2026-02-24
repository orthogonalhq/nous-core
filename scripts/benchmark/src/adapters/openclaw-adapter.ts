/**
 * OpenClaw adapter — P0 baseline path for launch-level proof.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 * Stub implementation; full OpenClaw integration deferred to follow-up.
 */
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
import { MockAdapter } from './mock-adapter.js';

const OPENCLAW_METADATA: AdapterMetadata = {
  adapter_id: 'openclaw-adapter',
  adapter_version: '1.0.0',
  target_agent_name: 'OpenClaw',
  target_agent_version: '1.0.0',
  supports: {
    tools: true,
    multimodal_image: true,
    memory_ops: true,
    workflow_dag: true,
  },
};

/**
 * OpenClaw adapter stub. Delegates to MockAdapter for Phase 2.4 baseline.
 * Full OpenClaw integration (external process/API) is a follow-up task.
 */
export class OpenClawAdapter implements AgentAdapter {
  readonly metadata = OPENCLAW_METADATA;
  private readonly delegate = new MockAdapter();

  async prepare(input: PrepareInput): Promise<PrepareOutput> {
    return this.delegate.prepare(input);
  }

  async execute(input: ExecuteInput): Promise<ExecuteOutput> {
    return this.delegate.execute(input);
  }

  async captureTrace(input: CaptureInput): Promise<TraceBundle> {
    return this.delegate.captureTrace(input);
  }

  async captureSideEffects(input: CaptureInput): Promise<SideEffectBundle> {
    return this.delegate.captureSideEffects(input);
  }

  async collectArtifacts(input: CaptureInput): Promise<ArtifactBundle> {
    const bundle = await this.delegate.collectArtifacts(input);
    return {
      ...bundle,
      evidence_bundle_ref: `openclaw-${bundle.evidence_bundle_ref}`,
    };
  }

  async cleanup(input: CleanupInput): Promise<CleanupOutput> {
    return this.delegate.cleanup(input);
  }
}
