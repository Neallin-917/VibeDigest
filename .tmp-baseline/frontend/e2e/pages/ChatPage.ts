import { expect, type Locator, type Page } from '@playwright/test';

export class ChatPage {
  readonly page: Page;
  readonly chatInput: Locator;
  readonly submitButton: Locator;
  readonly welcomeHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.welcomeHeading = page.locator('h1');
    this.chatInput = page.getByLabel(/Chat input/i);
    // Use the explicit aria-label for the send button
    this.submitButton = page.getByLabel(/Send message/i);
  }

  async goto() {
    await this.page.goto('/en/chat');
  }

  async submitMessage(message: string) {
    await this.chatInput.fill(message);
    await this.submitButton.click();
  }

  async expectMessageVisible(text: string) {
    await expect(this.page.getByText(text)).toBeVisible();
  }
}
