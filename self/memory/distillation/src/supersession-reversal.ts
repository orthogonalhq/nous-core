/**
 * Supersession reversal — restore source records, retire pattern.
 * Phase 4.3: Explicit rollback, no silent replacement.
 */
import type { ILtmStore, MemoryEntry, DistilledPattern } from '@nous/shared';
import { type SupersessionReversalRequest } from '@nous/shared';

export async function reverseSupersession(
  ltm: ILtmStore,
  request: SupersessionReversalRequest,
): Promise<void> {
  const pattern = await ltm.read(request.patternId);
  if (!pattern || pattern.type !== 'distilled-pattern') {
    throw new Error(`Pattern not found: ${request.patternId}`);
  }
  const dp = pattern as DistilledPattern;
  const sourceIds = dp.supersedes ?? dp.basedOn ?? [];
  if (sourceIds.length === 0) {
    throw new Error(`Pattern has no source records to restore: ${request.patternId}`);
  }

  for (const id of sourceIds) {
    const entry = await ltm.read(id);
    if (entry) {
      const restored: MemoryEntry = {
        ...entry,
        supersededBy: undefined,
        lifecycleStatus: 'active',
        updatedAt: new Date().toISOString(),
      };
      await ltm.write(restored);
    }
  }

  const retiredPattern: MemoryEntry = {
    ...pattern,
    lifecycleStatus: 'superseded',
    updatedAt: new Date().toISOString(),
  };
  await ltm.write(retiredPattern);
}
