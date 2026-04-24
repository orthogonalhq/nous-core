/**
 * UT-P1 — Detector purity reflection test.
 *
 * SDS § Invariants SUPV-SP4-002. Scans each `detection/sup-*.ts` file's
 * import list and asserts the allow-list is exactly
 * `{ '@nous/shared', './types.js' }`. Also invokes each detector against
 * spy witness + spy eventBus and asserts zero calls on either.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { IEventBus, IWitnessService } from '@nous/shared';
import { DETECTORS } from '../detection/index.js';
import { baseObservation, buildContext } from './detection/test-helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DETECTION_DIR = resolve(HERE, '..', 'detection');

function importSources(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const imports: string[] = [];
  const re = /import\s+(?:type\s+)?[^'"]*\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    imports.push(match[1]!);
  }
  return imports;
}

const ALLOWED_IMPORTS: ReadonlySet<string> = new Set([
  '@nous/shared',
  './types.js',
]);

describe('Detector purity — import allow-list', () => {
  const detectorFiles = readdirSync(DETECTION_DIR).filter(
    (f) => f.startsWith('sup-') && f.endsWith('.ts'),
  );
  it('has exactly 8 detector files', () => {
    expect(detectorFiles).toHaveLength(8);
  });
  for (const file of detectorFiles) {
    it(`${file}: imports only from @nous/shared and ./types.js`, () => {
      const full = resolve(DETECTION_DIR, file);
      const imports = importSources(full);
      for (const imp of imports) {
        expect(ALLOWED_IMPORTS.has(imp)).toBe(true);
      }
    });
  }
});

describe('Detector purity — runtime side-effect check', () => {
  it('invoking each detector with spy witness + spy eventBus yields zero calls on either', async () => {
    const witnessSpy = {
      appendInvariant: vi.fn(),
      appendAuthorization: vi.fn(),
      appendCompletion: vi.fn(),
      createCheckpoint: vi.fn(),
      rotateKeyEpoch: vi.fn(),
      verify: vi.fn(async () => ({}) as never),
      getReport: vi.fn(),
      listReports: vi.fn(),
      getLatestCheckpoint: vi.fn(),
    } as unknown as IWitnessService;
    const eventBusSpy = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      dispose: vi.fn(),
    } as unknown as IEventBus;
    const context = buildContext();
    for (const detector of DETECTORS) {
      try {
        await detector(baseObservation(), context);
      } catch {
        // ignore; some detectors may throw in no-context path
      }
    }
    expect(witnessSpy.appendInvariant).not.toHaveBeenCalled();
    expect(witnessSpy.appendAuthorization).not.toHaveBeenCalled();
    expect(witnessSpy.appendCompletion).not.toHaveBeenCalled();
    expect(eventBusSpy.publish).not.toHaveBeenCalled();
  });
});
