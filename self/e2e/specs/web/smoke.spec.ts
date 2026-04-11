import { test, expect } from '@playwright/test';

/**
 * Web smoke test — Playwright replacement for the curl HTTP-only check
 * in ci-release-candidate.yml lines 119-135.
 *
 * The original curl check only validates HTTP status codes (non-500, non-000).
 * A server returning an empty 200 page would pass. This Playwright spec
 * validates that the page actually renders DOM content.
 *
 * CI integration (replacing the curl check in the workflow) is handled
 * in sub-phase 1.3.
 */
test.describe('web smoke (replaces curl check)', () => {
  test('server responds with non-error status', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    // Must not be a server error (5xx)
    expect(response!.status()).toBeLessThan(500);
  });

  test('page renders DOM content', async ({ page }) => {
    await page.goto('/');
    // Body must have child elements — not an empty page
    const bodyChildren = await page.locator('body').locator('> *').count();
    expect(bodyChildren).toBeGreaterThan(0);
  });

  test('page has a title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });
});
