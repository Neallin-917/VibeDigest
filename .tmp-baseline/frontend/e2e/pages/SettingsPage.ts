import { expect, type Locator, type Page } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;
  readonly themeToggle: Locator;
  
  constructor(page: Page) {
    this.page = page;
    this.themeToggle = page.getByRole('button', { name: /Theme|Dark mode/i });
  }

  async goto() {
      await this.page.goto('/en/settings');
  }
}
