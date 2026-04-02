import { expect, type Locator, type Page } from '@playwright/test';

export class AuthPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly passwordModeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByPlaceholder('name@example.com');
    this.passwordInput = page.getByPlaceholder('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign In', exact: true });
    this.passwordModeButton = page.getByRole('button', { name: /Sign in with Password/i });
  }

  async gotoLogin() {
    await this.page.goto('/en/login');
  }

  async login(email: string, password: string) {
    if (await this.passwordModeButton.isVisible({ timeout: 5000 })) {
        await this.passwordModeButton.click();
    }
    await expect(this.passwordInput).toBeVisible({ timeout: 5000 });
    
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }
}
