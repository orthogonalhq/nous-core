import { test, expect } from '../../fixtures/desktop';

test.describe('chat flow (requires backend)', () => {
  test('can send a message and receive a response', async ({ page }) => {
    // Generous timeout — backend response time varies
    test.setTimeout(60_000);

    // Locate the chat input — the ChatInput component renders a textarea or input
    const chatInput = page.locator('[data-testid="chat-input"], textarea, input[type="text"]').first();
    await chatInput.waitFor({ state: 'visible', timeout: 15_000 });

    // Type a test message
    await chatInput.fill('Hello, this is an E2E test message');

    // Send the message — press Enter or click a send button
    await chatInput.press('Enter');

    // Wait for a response element to appear in the conversation
    // The assistant response renders as a new element in the chat history
    const responseElement = page.locator(
      '[data-testid="chat-response"], [data-testid="assistant-message"], [role="assistant"], .assistant-message'
    ).first();

    await responseElement.waitFor({ state: 'visible', timeout: 30_000 });

    // Assert the response contains text content
    const responseText = await responseElement.textContent();
    expect(responseText).toBeTruthy();
    expect(responseText!.trim().length).toBeGreaterThan(0);
  });
});
