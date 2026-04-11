import { test, expect } from '@playwright/test';

test.describe('web rendered content', () => {
  test('page loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Nous');
  });

  test('body has child elements', async ({ page }) => {
    await page.goto('/');
    const bodyChildren = await page.locator('body').locator('> *').count();
    expect(bodyChildren).toBeGreaterThan(0);
  });

  test('no error indicators on page', async ({ page }) => {
    await page.goto('/');
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    // Ensure the page is not a raw 500 error page
    expect(bodyText).not.toMatch(/^500$/);
  });
});
