import type {
  NudgeReasonCode,
  NudgeSuppressionCheckRequest,
  NudgeSuppressionCheckResult,
  NudgeSuppressionRecord,
  TraceEvidenceReference,
} from '@nous/shared';
import {
  NudgeSuppressionCheckRequestSchema,
  NudgeSuppressionCheckResultSchema,
} from '@nous/shared';
import { SuppressionStore } from './suppression-store.js';

export interface SuppressionEngineOptions {
  suppressionStore: SuppressionStore;
  now?: () => string;
}

function evidenceRefKey(ref: TraceEvidenceReference): string {
  return JSON.stringify(
    Object.entries(ref).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function mergeEvidenceRefs(
  ...collections: Array<readonly TraceEvidenceReference[] | undefined>
): TraceEvidenceReference[] {
  const merged = new Map<string, TraceEvidenceReference>();
  for (const refs of collections) {
    for (const ref of refs ?? []) {
      merged.set(evidenceRefKey(ref), ref);
    }
  }
  return [...merged.values()];
}

function suppressionReasonCode(record: NudgeSuppressionRecord): NudgeReasonCode {
  switch (record.action) {
    case 'dismiss_once':
      return 'NDG-SUPPRESSION-DISMISS-ONCE';
    case 'snooze':
      return 'NDG-SUPPRESSION-SNOOZE-ACTIVE';
    case 'mute_category':
      return 'NDG-SUPPRESSION-MUTED-CATEGORY';
    case 'mute_project':
      return 'NDG-SUPPRESSION-MUTED-PROJECT';
    case 'mute_global':
    default:
      return 'NDG-SUPPRESSION-MUTED-GLOBAL';
  }
}

function isExpired(record: NudgeSuppressionRecord, checkedAt: string): boolean {
  return !!record.expires_at && record.expires_at <= checkedAt;
}

function matchesSurface(
  record: NudgeSuppressionRecord,
  surface: NudgeSuppressionCheckRequest['surface'],
): boolean {
  return record.surface_set.length === 0 || record.surface_set.includes(surface);
}

function matchesScope(record: NudgeSuppressionRecord, input: NudgeSuppressionCheckRequest): boolean {
  switch (record.scope) {
    case 'candidate':
      return record.target_ref === input.candidate.candidate_id;
    case 'category':
      return record.target_ref === input.candidate.source_type;
    case 'project':
      return (
        input.requesting_project_id != null &&
        record.target_ref === input.requesting_project_id
      );
    case 'global':
      return record.target_ref === 'global';
    default:
      return false;
  }
}

export class SuppressionEngine {
  private readonly suppressionStore: SuppressionStore;
  private readonly now: () => string;

  constructor(options: SuppressionEngineOptions) {
    this.suppressionStore = options.suppressionStore;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async evaluate(
    input: NudgeSuppressionCheckRequest,
  ): Promise<NudgeSuppressionCheckResult> {
    const parsed = NudgeSuppressionCheckRequestSchema.parse(input);
    const checkedAt = parsed.checked_at ?? this.now();
    const matched = (await this.suppressionStore.list()).filter(
      (record) =>
        !isExpired(record, checkedAt) &&
        matchesSurface(record, parsed.surface) &&
        matchesScope(record, parsed),
    );

    return NudgeSuppressionCheckResultSchema.parse({
      candidate_id: parsed.candidate.candidate_id,
      blocked: matched.length > 0,
      matched_suppressions: matched,
      reason_codes: [...new Set(matched.map(suppressionReasonCode))],
      evidence_refs: mergeEvidenceRefs(
        parsed.evidence_refs,
        ...matched.map((record) => record.evidence_refs),
      ),
      checked_at: checkedAt,
    });
  }
}
