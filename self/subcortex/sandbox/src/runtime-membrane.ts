/**
 * Governed runtime membrane baseline for package sandbox execution.
 */
import {
  SandboxPayloadSchema,
  type PackageLifecycleReasonCode,
  type SandboxDecision,
  type SandboxPayload,
  type SandboxResult,
} from '@nous/shared';
import { evaluateSandboxAdmission } from './admission-evaluator.js';
import type { GrantReplayStore } from './grant-replay-store.js';
import { InMemoryGrantReplayStore } from './grant-replay-store.js';
import { validateCapabilityGrant } from './capability-grant-validator.js';

export interface RuntimeMembraneOptions {
  replayStore?: GrantReplayStore;
  now?: () => Date;
  onAllow?: (payload: SandboxPayload) => Promise<unknown> | unknown;
  witnessRefFactory?: () => string;
}

const DEFAULT_OUTPUT = { status: 'membrane_allow' } as const;

const toDecision = (
  decision: SandboxDecision['decision'],
  reasonCode?: PackageLifecycleReasonCode,
): SandboxDecision => ({
  decision,
  ...(reasonCode ? { reason_code: reasonCode } : {}),
});

export class RuntimeMembrane {
  private readonly replayStore: GrantReplayStore;
  private readonly now: () => Date;
  private readonly onAllow?: (payload: SandboxPayload) => Promise<unknown> | unknown;
  private readonly witnessRefFactory: () => string;

  constructor(options: RuntimeMembraneOptions = {}) {
    this.replayStore = options.replayStore ?? new InMemoryGrantReplayStore();
    this.now = options.now ?? (() => new Date());
    this.onAllow = options.onAllow;
    this.witnessRefFactory =
      options.witnessRefFactory ??
      (() => `witness_${this.now().getTime().toString(36)}`);
  }

  hasCapability(
    capability: string,
    declaredCapabilities?: readonly string[],
  ): boolean {
    if (!declaredCapabilities) {
      return false;
    }
    return declaredCapabilities.includes(capability);
  }

  async execute(payload: SandboxPayload): Promise<SandboxResult> {
    const startedAt = this.now().getTime();
    const parsed = SandboxPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      return this.toResult({
        success: false,
        decision: toDecision('deny', 'PKG-003-POLICY_INCOMPATIBLE'),
        output: null,
        error: 'Invalid sandbox payload',
        startedAt,
      });
    }

    const validatedPayload = parsed.data;

    if (validatedPayload.action.direct_access_target !== 'none') {
      return this.toResult({
        success: false,
        decision: toDecision('deny', 'PKG-003-DIRECT_ACCESS_DENIED'),
        output: null,
        error: 'Direct access target denied by runtime membrane',
        startedAt,
      });
    }

    if (
      !this.hasCapability(
        validatedPayload.action.requested_capability,
        validatedPayload.declared_capabilities,
      )
    ) {
      return this.toResult({
        success: false,
        decision: toDecision('deny', 'PKG-002-CAPABILITY_NOT_GRANTED'),
        output: null,
        error: 'Requested capability is not declared by package',
        startedAt,
      });
    }

    const admission = evaluateSandboxAdmission(validatedPayload);
    if (admission.decision !== 'allow') {
      return this.toResult({
        success: false,
        decision: toDecision(admission.decision, admission.reasonCode),
        output: null,
        error: 'Admission denied by sandbox membrane',
        startedAt,
      });
    }

    if (validatedPayload.action.requires_approval) {
      const grantValidation = validateCapabilityGrant(
        validatedPayload,
        this.replayStore,
        this.now(),
      );
      if (!grantValidation.ok) {
        return this.toResult({
          success: false,
          decision: toDecision('deny', grantValidation.reasonCode),
          output: null,
          error: 'Capability approval validation failed',
          startedAt,
        });
      }
    }

    const output = this.onAllow
      ? await this.onAllow(validatedPayload)
      : DEFAULT_OUTPUT;

    return this.toResult({
      success: true,
      decision: toDecision('allow'),
      output,
      startedAt,
    });
  }

  private toResult(input: {
    success: boolean;
    decision: SandboxDecision;
    output: unknown;
    startedAt: number;
    error?: string;
  }): SandboxResult {
    const endedAt = this.now().getTime();
    return {
      success: input.success,
      decision: {
        ...input.decision,
        ...(input.decision.decision !== 'allow'
          ? { witness_ref: this.witnessRefFactory() }
          : {}),
      },
      output: input.output,
      ...(input.error ? { error: input.error } : {}),
      resourceUsage: {
        durationMs: Math.max(0, endedAt - input.startedAt),
        memoryMb: 0,
      },
    };
  }
}

