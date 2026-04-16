import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverBundlePath = join(__dirname, '..', 'out', 'server', 'main.js');

function readServerBundle(): string {
  if (!existsSync(serverBundlePath)) {
    throw new Error(
      `Expected built server bundle at ${serverBundlePath}. Run the desktop build before this test.`,
    );
  }

  return readFileSync(serverBundlePath, 'utf-8');
}

describe('desktop production build output', () => {
  it('emits out/server/main.js and bundles more than 1 MB of code', () => {
    expect(existsSync(serverBundlePath)).toBe(true);
    expect(statSync(serverBundlePath).size).toBeGreaterThan(1_000_000);
  });

  it('does not leave @nous requires behind in the bundled server entry', () => {
    const bundle = readServerBundle();

    expect(bundle).not.toContain('require("@nous/');
    expect(bundle).not.toContain("require('@nous/");
  });

  it('keeps better-sqlite3 external in the server bundle', () => {
    const bundle = readServerBundle();

    expect(bundle).toMatch(/require\((['"])better-sqlite3\1\)|better_sqlite3\.node/);
  });
});
