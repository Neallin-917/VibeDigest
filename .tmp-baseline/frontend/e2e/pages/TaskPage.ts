import { expect, type Locator, type Page } from '@playwright/test';

export class TaskPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async expectTaskCardVisible(title: string) {
     await expect(this.page.getByText(title).first()).toBeVisible({ timeout: 10000 });
  }

  async expectStatus(status: string) {
      await expect(this.page.getByText(status)).toBeVisible();
  }
  
  async expectContentVisible(text: string) {
      await expect(this.page.getByText(text)).toBeVisible();
  }
}
