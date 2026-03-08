/**
 * Supersession reversal - restore source records, retire pattern.
 * Phase 4.3: Explicit rollback, no silent replacement.
 *
 * **Caller contract (Phase 4.4, ADR-002):** When invoking reverseSupersession,
 * the caller MUST emit MemoryMutationAuditRecord with action 'supersede',
 * traceId, evidenceRefs from request, outcome 'applied', reason from request.
 * See .worklog/phase-4/phase-4.4/export-hooks.mdx
 */
import type { ILtmStore, MemoryEntry, DistilledPattern } from '@nous/shared';
import { type SupersessionReversalRequest } from '@nous/shared';
import type { DistillationObserver } from './production-contracts.js';
import { emitObserverLog, emitObserverMetric } from './production-contracts.js';

export interface SupersessionReversalOptions {
  now?: () => string;
  observer?: DistillationObserver;
}

export const REVERSAL_AUDIT_CALLER_CONTRACT =
  'Caller must emit MemoryMutationAuditRecord when invoking reverseSupersession';

function nowIso(): string {
  return new Date().toISOString();
}

export async function reverseSupersession(
  ltm: ILtmStore,
  request: SupersessionReversalRequest,
  options: SupersessionReversalOptions = {},
): Promise<void> {
  const currentNow = options.now ?? nowIso;

  try {
    const pattern = await ltm.read(request.patternId);
    if (!pattern || pattern.type !== 'distilled-pattern') {
      throw new Error(`Pattern not found: ${request.patternId}`);
    }
    const dp = pattern as DistilledPattern;
    const sourceIds = [...new Set(dp.supersedes ?? dp.basedOn ?? [])];
    if (sourceIds.length === 0) {
      throw new Error(
        `Pattern has no source records to restore: ${request.patternId}`,
      );
    }

    for (const id of sourceIds) {
      const entry = await ltm.read(id);
      if (entry) {
        const restored: MemoryEntry = {
          ...entry,
          supersededBy: undefined,
          lifecycleStatus: 'active',
          updatedAt: currentNow(),
        };
        await ltm.write(restored);
      }
    }

    const retiredPattern: MemoryEntry = {
      ...pattern,
      lifecycleStatus: 'superseded',
      updatedAt: currentNow(),
    };
    await ltm.write(retiredPattern);

    await emitObserverMetric(options.observer, {
      name: 'distillation_reversal_total',
      value: 1,
      labels: { outcome: 'success' },
    });
    await emitObserverLog(options.observer, {
      event: 'distillation.reversal',
      fields: {
        patternId: request.patternId,
        restoredSourceCount: sourceIds.length,
        traceId: pattern.provenance.traceId,
      },
    });
  } catch (error) {
    await emitObserverMetric(options.observer, {
      name: 'distillation_reversal_total',
      value: 1,
      labels: { outcome: 'failure' },
    });
    throw error;
  }
}
