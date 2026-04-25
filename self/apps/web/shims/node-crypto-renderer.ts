/**
 * WR-162 SP 10 — renderer-safe stub for `node:crypto` (Next.js web app).
 *
 * `@nous/ui`'s MAO recovery components (added in SP 10) import the pure
 * tier helpers `getRequiredTier`, `getTierDisplay`, and the
 * `ConfirmationTierDisplay` type from `@nous/subcortex-opctl`. The opctl
 * package's `confirmation.ts` also defines `issueConfirmationProof`,
 * `issueSystemProof`, and `hashScope` — proof-issuance helpers that run
 * only on the server side and pull in `node:crypto` at module top level.
 *
 * Webpack cannot tree-shake the top-level `import { randomUUID,
 * createHash } from 'node:crypto'` when bundling for the browser. This
 * shim provides browser-safe replacements so the renderer bundle resolves;
 * any accidental call into a proof-issuance helper from the renderer would
 * throw at call time, surfacing the contract defect rather than silently
 * producing an invalid proof.
 */

export function randomUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  throw new Error(
    'randomUUID is not available in this renderer environment. ' +
      'Proof-issuance helpers (`issueConfirmationProof`, `issueSystemProof`) ' +
      'must run server-side; importing them in the renderer is a contract ' +
      'defect (WR-162 SP 10 renderer crypto stub).',
  );
}

export function createHash(_algorithm: string): never {
  throw new Error(
    'createHash is not available in this renderer environment. ' +
      'Proof-issuance helpers (`issueConfirmationProof`, `issueSystemProof`, ' +
      '`hashScope`) must run server-side; importing them in the renderer is ' +
      'a contract defect (WR-162 SP 10 renderer crypto stub).',
  );
}
