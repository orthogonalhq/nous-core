/**
 * WR-162 SP 4 — Classifier dispatch.
 *
 * SDS § Boundaries § Interfaces item 4. `classify` iterates the
 * `DETECTORS` frozen array in order, awaits each, filters non-null
 * candidates, and promotes each into a `SupervisorViolationRecord`
 * (without yet populating `evidenceRefs` — the service path joins the
 * detection witness event id in post-write).
 *
 * The function is pure: no side effects, no EventBus publish, no witness
 * write. All of that happens in `SupervisorService.runClassifier` after
 * this returns.
 *
 * Error isolation: per-detector exceptions are caught so a single bad
 * detector does NOT break the remaining detectors. The caller may pass
 * an optional `onDetectorError` hook to record the failure (service
 * layer wires log + metric).
 */
import type {
  SupervisorObservation,
  SupervisorViolationRecord,
} from '@nous/shared';
import type { DetectorContext, DetectorFn } from './detection/types.js';
import { DETECTORS } from './detection/index.js';

export interface ClassifyOptions {
  readonly detectors?: readonly DetectorFn[];
  readonly onDetectorError?: (
    detectorIndex: number,
    error: unknown,
  ) => void;
}

/**
 * Run every detector in order. Identity fields on the observation are
 * assumed non-null (the Identity-Completeness Gate in
 * `SupervisorService.runClassifier` drops observations with nulls
 * BEFORE calling `classify`). `evidenceRefs` is left empty — the service
 * path appends the detection witness event id after writing.
 */
export async function classify(
  observation: SupervisorObservation,
  context: DetectorContext,
  options: ClassifyOptions = {},
): Promise<SupervisorViolationRecord[]> {
  const detectors = options.detectors ?? DETECTORS;
  const onDetectorError = options.onDetectorError;
  const records: SupervisorViolationRecord[] = [];
  const agentId = observation.agentId;
  const agentClass = observation.agentClass;
  const runId = observation.runId;
  const projectId = observation.projectId;
  // Identity-Completeness Gate should have dropped this observation
  // before classify was invoked. Defensive check — return empty rather
  // than produce a record that cannot parse against the schema.
  if (
    agentId === null ||
    agentClass === null ||
    runId === null ||
    projectId === null
  ) {
    return records;
  }
  const detectedAt = context.now();
  for (let i = 0; i < detectors.length; i += 1) {
    const detector = detectors[i];
    if (detector === undefined) continue;
    let candidate: Awaited<ReturnType<DetectorFn>> = null;
    try {
      candidate = await detector(observation, context);
    } catch (error) {
      if (onDetectorError !== undefined) {
        onDetectorError(i, error);
      }
      continue;
    }
    if (candidate === null) continue;
    records.push({
      supCode: candidate.supCode,
      severity: candidate.severity,
      agentId,
      agentClass,
      runId,
      projectId,
      evidenceRefs: [],
      detectedAt,
      enforcement: null,
    });
  }
  return records;
}
