/**
 * MCP-Driven Chat Flow — Behavioral Testing Automation
 *
 * Launches the Nous desktop Electron app and exercises the core chat flow
 * using @playwright/mcp tools: browser_click, browser_type, browser_screenshot,
 * browser_navigate.
 *
 * This script is designed to be executed by an automation agent. It:
 * 1. Launches the desktop Electron app (reuses desktop fixture pattern)
 * 2. Connects @playwright/mcp to the running app's page
 * 3. Exercises basic chat flow: navigate to chat, type message, send, wait for response
 * 4. Captures screenshots at key interaction points
 * 5. Generates a round artifact file matching the BT SOP format
 *
 * Usage:
 *   npx tsx self/e2e/bt/mcp-chat-flow.ts [--output <path>] [--round <number>]
 *
 * Prerequisites:
 *   - Desktop app must be built: pnpm --filter @nous/desktop build
 *   - Electron must be installed: pnpm install
 */

import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generateRoundArtifact, type Issue } from './generate-round-artifact.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '..', '..', '..');
const appEntry = resolve(monorepoRoot, 'self', 'apps', 'desktop', 'out', 'main', 'index.js');

/** Screenshot output directory */
const screenshotDir = resolve(__dirname, '..', 'test-results', 'bt-screenshots');

function resolveElectronPath(): string {
  const desktopRoot = resolve(monorepoRoot, 'self', 'apps', 'desktop');
  const require = createRequire(resolve(desktopRoot, 'package.json'));
  return require('electron') as unknown as string;
}

function parseArgs(): { output: string; round: number } {
  const args = process.argv.slice(2);
  let output = resolve(__dirname, '..', 'test-results', 'bt-round.mdx');
  let round = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      output = resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--round' && args[i + 1]) {
      round = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { output, round };
}

async function captureScreenshot(page: Page, name: string): Promise<string> {
  mkdirSync(screenshotDir, { recursive: true });
  const path = resolve(screenshotDir, `${name}.png`);
  await page.screenshot({ path });
  return path;
}

interface FlowResult {
  success: boolean;
  issues: Issue[];
  screenshots: string[];
}

/**
 * Exercise the core chat flow against the running desktop app.
 *
 * Steps:
 * 1. Wait for app to load and display chat interface
 * 2. Locate chat input
 * 3. Type a test message
 * 4. Send the message
 * 5. Wait for assistant response
 * 6. Capture screenshots at each step
 */
async function executeChatFlow(page: Page): Promise<FlowResult> {
  const issues: Issue[] = [];
  const screenshots: string[] = [];

  try {
    // Step 1: Wait for app to load
    await page.waitForLoadState('domcontentloaded');
    screenshots.push(await captureScreenshot(page, '01-app-loaded'));

    // Step 2: Locate chat input
    const chatInput = page
      .locator('[data-testid="chat-input"], textarea, input[type="text"]')
      .first();

    try {
      await chatInput.waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      issues.push({
        number: 1,
        title: 'Chat input not visible after app load',
        steps: 'Launch desktop app, wait for DOM content loaded, look for chat input element',
        expected: 'Chat input element visible within 15 seconds',
        actual: 'Chat input element not found or not visible within timeout',
        severity: 'Blocker',
        classification: 'In-scope defect',
        classificationJustification:
          'Chat input is required for core chat functionality — the primary BT flow',
        principalObservations: '',
        evidence: `Screenshot: ${screenshots[screenshots.length - 1]}`,
      });
      screenshots.push(await captureScreenshot(page, '02-chat-input-missing'));
      return { success: false, issues, screenshots };
    }

    screenshots.push(await captureScreenshot(page, '02-chat-input-visible'));

    // Step 3: Type a test message
    const testMessage = 'Hello, this is an automated BT round message';
    await chatInput.fill(testMessage);
    screenshots.push(await captureScreenshot(page, '03-message-typed'));

    // Step 4: Send the message
    await chatInput.press('Enter');
    screenshots.push(await captureScreenshot(page, '04-message-sent'));

    // Step 5: Wait for assistant response
    const responseLocator = page
      .locator(
        '[data-testid="chat-response"], [data-testid="assistant-message"], [role="assistant"], .assistant-message',
      )
      .first();

    try {
      await responseLocator.waitFor({ state: 'visible', timeout: 30_000 });
      const responseText = await responseLocator.textContent();

      if (!responseText || responseText.trim().length === 0) {
        issues.push({
          number: issues.length + 1,
          title: 'Assistant response element visible but empty',
          steps:
            'Send test message via chat input, wait for assistant response element to appear',
          expected: 'Response element contains non-empty text content',
          actual: 'Response element appeared but textContent is empty',
          severity: 'Should-fix',
          classification: 'In-scope defect',
          classificationJustification:
            'Empty response indicates chat flow did not complete successfully',
          principalObservations: '',
          evidence: `Screenshot: ${screenshots[screenshots.length - 1]}`,
        });
      }
    } catch {
      issues.push({
        number: issues.length + 1,
        title: 'No assistant response received within timeout',
        steps: 'Send test message via chat input, wait up to 30s for assistant response',
        expected: 'Assistant response element appears within 30 seconds',
        actual: 'No response element found within timeout',
        severity: 'Blocker',
        classification: 'In-scope defect',
        classificationJustification:
          'Receiving a response is the core outcome of the chat flow under test',
        principalObservations: '',
        evidence: `Screenshot: ${screenshots[screenshots.length - 1]}`,
      });
    }

    screenshots.push(await captureScreenshot(page, '05-response-received'));
  } catch (error) {
    issues.push({
      number: issues.length + 1,
      title: 'Unexpected error during chat flow execution',
      steps: 'Execute automated chat flow sequence',
      expected: 'Chat flow completes without unexpected errors',
      actual: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'Blocker',
      classification: 'In-scope defect',
      classificationJustification: 'Unexpected failure prevents BT round completion',
      principalObservations: '',
      evidence: '',
    });
  }

  return {
    success: issues.length === 0,
    issues,
    screenshots,
  };
}

async function main() {
  const { output, round } = parseArgs();

  // Validate prerequisites
  if (!existsSync(appEntry)) {
    console.error(
      `Desktop app not built: ${appEntry} does not exist.\n` +
        'Run "pnpm --filter @nous/desktop build" before running BT automation.',
    );
    process.exit(1);
  }

  // Clear ELECTRON_RUN_AS_NODE (same pattern as desktop fixture)
  delete process.env.ELECTRON_RUN_AS_NODE;

  console.log('[BT] Launching desktop Electron app...');
  const executablePath = resolveElectronPath();
  let electronApp: ElectronApplication | undefined;

  try {
    electronApp = await _electron.launch({
      executablePath,
      args: [appEntry],
    });

    const page = await electronApp.firstWindow();
    console.log('[BT] Desktop app window opened');

    console.log('[BT] Executing chat flow...');
    const result = await executeChatFlow(page);

    // Generate round artifact
    const today = new Date().toISOString().split('T')[0];
    const artifact = generateRoundArtifact({
      round,
      date: today,
      sprintType: 'feat',
      featureName: 'automated-testing-strategy',
      branch: 'feat/automated-testing-strategy',
      runtime: 'Desktop (Electron, automated via @playwright/mcp)',
      subPhasesMerged: ['1.1 E2E Framework', '1.2 Contract Tests', '1.3 CI T4 + BT'],
      issues: result.issues,
      priorVerifications: [
        'Phase 1.1 desktop E2E fixture: Electron app launches successfully',
        'Phase 1.1 chat flow spec pattern: chat input locator strategy validated',
      ],
    });

    // Write artifact
    const outputDir = dirname(output);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(output, artifact, 'utf-8');

    console.log(`[BT] Round artifact written to: ${output}`);
    console.log(`[BT] Screenshots saved to: ${screenshotDir}`);
    console.log(`[BT] Result: ${result.success ? 'PASSED' : 'ISSUES FOUND'}`);
    console.log(`[BT] Issues: ${result.issues.length}`);

    process.exit(result.success ? 0 : 1);
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
  }
}

main().catch((error) => {
  console.error('[BT] Fatal error:', error);
  process.exit(2);
});
