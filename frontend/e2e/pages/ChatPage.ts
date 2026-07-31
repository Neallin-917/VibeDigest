import { expect, type Locator, type Page } from '@playwright/test';

export class ChatPage {
  readonly page: Page;
  readonly chatInput: Locator;
  readonly submitButton: Locator;
  readonly welcomeHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.welcomeHeading = page.locator('h1');
    this.chatInput = page.getByLabel(/Chat input/i).filter({ visible: true }).first();
    // Use the explicit aria-label for the send button
    this.submitButton = page.getByLabel(/Send message/i).filter({ visible: true }).first();
  }

  async goto() {
    await this.page.goto('/en/chat');
  }

  async fillMessage(message: string) {
    // The input is server-rendered before React attaches its change handler.
    // Retry the actual edit until the controlled input and its button agree,
    // so CI cannot lose a pre-hydration fill.
    await expect(async () => {
      await this.chatInput.fill('');
      await this.chatInput.fill(message);
      await expect(this.chatInput).toHaveValue(message);
      await expect(this.submitButton).toBeEnabled();
    }).toPass({ timeout: 15_000 });
  }

  async submitMessage(message: string) {
    await this.fillMessage(message);
    await this.submitButton.click();
  }

  async expectMessageVisible(text: string) {
    await expect(this.page.getByText(text)).toBeVisible();
  }
}
