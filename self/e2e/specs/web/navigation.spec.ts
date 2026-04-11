import { test, expect } from '@playwright/test';

test.describe('web navigation', () => {
  test('root page loads successfully', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response!.ok() || response!.status() === 304).toBe(true);
  });

  test('page has visible content', async ({ page }) => {
    await page.goto('/');
    // Assert the page is not blank — body has visible content
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });
});
