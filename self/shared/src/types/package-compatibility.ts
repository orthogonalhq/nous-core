/**
 * Package compatibility and capability-delta contracts.
 *
 * Phase 7.2: Shared compatibility gate types and helpers for package admission.
 */
import semver from 'semver';
import { z } from 'zod';
import { PackageLifecycleReasonCodeSchema } from './package-lifecycle.js';

export const ApiContractRangeEvaluationSchema = z.object({
  manifest_range: z.string().min(1),
  runtime_sdk_version: z.string().min(1),
  compatible: z.boolean(),
  reason_code: PackageLifecycleReasonCodeSchema.optional(),
});
export type ApiContractRangeEvaluation = z.infer<
  typeof ApiContractRangeEvaluationSchema
>;

export const CapabilityDeltaSchema = z.object({
  added: z.array(z.string().min(1)),
  removed: z.array(z.string().min(1)),
  requires_reapproval: z.boolean(),
});
export type CapabilityDelta = z.infer<typeof CapabilityDeltaSchema>;

export const evaluateApiContractRange = (
  manifestRange: string,
  runtimeVersion: string,
): boolean => {
  if (!manifestRange || !runtimeVersion) {
    return false;
  }

  const validRuntimeVersion = semver.valid(runtimeVersion);
  const validRange = semver.validRange(manifestRange);
  if (!validRuntimeVersion || !validRange) {
    return false;
  }

  return semver.satisfies(validRuntimeVersion, validRange, {
    includePrerelease: true,
  });
};

const normalizeCapabilities = (capabilities: readonly string[]): string[] => {
  const unique = new Set(capabilities.map((capability) => capability.trim()));
  return [...unique].filter((capability) => capability.length > 0);
};

export const calculateCapabilityDelta = (
  previousCapabilities: readonly string[],
  nextCapabilities: readonly string[],
): CapabilityDelta => {
  const previous = normalizeCapabilities(previousCapabilities);
  const next = normalizeCapabilities(nextCapabilities);

  const previousSet = new Set(previous);
  const nextSet = new Set(next);

  const added = next.filter((capability) => !previousSet.has(capability));
  const removed = previous.filter((capability) => !nextSet.has(capability));

  return {
    added,
    removed,
    requires_reapproval: added.length > 0,
  };
};

