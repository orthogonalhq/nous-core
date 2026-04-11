import { test as base, type ElectronApplication, type Page } from '@playwright/test';
import { _electron } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Monorepo root: e2e/fixtures -> e2e -> self -> nous-core */
const monorepoRoot = resolve(__dirname, '..', '..', '..');

/** Path to the built desktop app main process entry */
const appEntry = resolve(monorepoRoot, 'self', 'apps', 'desktop', 'out', 'main', 'index.js');

/**
 * Resolve the Electron binary path.
 *
 * `electron` package exports a string path to the binary when required.
 * We use createRequire to resolve it from the desktop package's context,
 * since that's where Electron is installed as a devDependency.
 */
function resolveElectronPath(): string {
  const desktopRoot = resolve(monorepoRoot, 'self', 'apps', 'desktop');
  const require = createRequire(resolve(desktopRoot, 'package.json'));
  return require('electron') as unknown as string;
}

type DesktopFixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

/**
 * Extended Playwright test fixture that launches the Nous desktop Electron app.
 *
 * Prerequisites:
 *   - `pnpm --filter @nous/desktop build` must have been run (produces out/main/index.js)
 *   - Electron must be installed (via pnpm install)
 *
 * The fixture clears ELECTRON_RUN_AS_NODE before launch, mirroring the pattern
 * in self/apps/desktop/scripts/start-dev.mjs. Without this, Electron runs as
 * plain Node.js and BrowserWindow/app APIs are unavailable.
 */
export const test = base.extend<DesktopFixtures>({
  electronApp: async ({}, use) => {
    // Clear ELECTRON_RUN_AS_NODE — required when running inside VSCode/Claude Code
    // (both are Electron apps that set this env var)
    delete process.env.ELECTRON_RUN_AS_NODE;

    if (!existsSync(appEntry)) {
      throw new Error(
        `Desktop app not built: ${appEntry} does not exist.\n` +
        'Run "pnpm --filter @nous/desktop build" before running desktop E2E specs.'
      );
    }

    const executablePath = resolveElectronPath();

    const electronApp = await _electron.launch({
      executablePath,
      args: [appEntry],
    });

    await use(electronApp);

    await electronApp.close();
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await use(page);
  },
});

export { expect } from '@playwright/test';
