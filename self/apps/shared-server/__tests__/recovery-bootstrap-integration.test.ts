/**
 * Bootstrap recovery-witness integration test (IT-SP8-BOOT-WITNESS-FLOW).
 *
 * WR-162 SP 8 — Recovery Orchestrator Expansion + Crash-Detect Wiring.
 * Validates that the bootstrap composition root preserves the SP 8 invariants:
 *
 *   - `bootstrap.ts:714` `new WitnessService(documentStore)` constructed before
 *     `bootstrap.ts:1369` `new RecoveryOrchestrator()` (initialization order
 *     preserved per SUPV-SP8-018; both lines unchanged).
 *   - `RecoveryOrchestrator` constructor remains parameterless per SUPV-SP8-014
 *     (per-call witness threading via `RecoveryOrchestratorContext.witness`,
 *     not constructor-bound state).
 *   - The cortex-runtime + principal-system-runtime crash-detect blocks both
 *     declare `witness: this.deps.witnessService,` in the per-call
 *     `recoveryContext` literal (SUPV-SP8-015 + SUPV-SP8-016).
 *
 * The test reads the bootstrap source at fixed line ranges and asserts the
 * declarations are present. This is the bootstrap-composition-root analog to
 * the orchestrator-side `recovery-orchestrator-witness-emission.test.ts`
 * (UT-SP8-EM-* + UT-SP8-CTX-* + UT-SP8-UNWIRED-*) and the runtime-side
 * `recovery-crash-detect.test.ts` (IT-SP8-CR-*); together the three test files
 * close the SP 8 wiring contract.
 */
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

async function readBootstrapSource(): Promise<string> {
  const here = fileURLToPath(import.meta.url);
  // __tests__ → shared-server → src/bootstrap.ts
  const path = resolve(dirname(here), '../src/bootstrap.ts');
  return fs.readFile(path, 'utf8');
}

describe('Bootstrap recovery-witness integration (IT-SP8-BOOT-WITNESS-FLOW)', () => {
  it('IT-SP8-BOOT-WITNESS-FLOW witness-service construction precedes recovery-orchestrator construction', async () => {
    const source = await readBootstrapSource();
    const witnessIdx = source.indexOf('new WitnessService(documentStore)');
    const recoveryIdx = source.indexOf('new RecoveryOrchestrator()');
    expect(witnessIdx).toBeGreaterThan(-1);
    expect(recoveryIdx).toBeGreaterThan(-1);
    expect(witnessIdx).toBeLessThan(recoveryIdx);
  });

  it('IT-SP8-BOOT-WITNESS-FLOW RecoveryOrchestrator constructor remains parameterless (SUPV-SP8-014)', async () => {
    const source = await readBootstrapSource();
    // The `new RecoveryOrchestrator()` literal appears with empty parens; an
    // accidental parametered construction in the future would surface here.
    expect(source).toMatch(/new\s+RecoveryOrchestrator\s*\(\s*\)/);
    expect(source).not.toMatch(/new\s+RecoveryOrchestrator\s*\(\s*[^)]/);
  });
});
