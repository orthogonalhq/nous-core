import { test, expect } from '../../fixtures/desktop';

test.describe('desktop window state', () => {
  test('window is visible', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win ? win.isVisible() : false;
    });
    expect(isVisible).toBe(true);
  });

  test('window dimensions are at least 800x600', async ({ page }) => {
    const size = page.viewportSize();
    expect(size).not.toBeNull();
    // Desktop app has minWidth: 800, minHeight: 600
    expect(size!.width).toBeGreaterThanOrEqual(800);
    expect(size!.height).toBeGreaterThanOrEqual(600);
  });

  test('page has loaded with DOM content', async ({ page }) => {
    // Wait for the page to have content in the body
    await page.waitForSelector('body', { state: 'attached' });
    const bodyChildren = await page.locator('body').locator('> *').count();
    expect(bodyChildren).toBeGreaterThan(0);
  });
});
