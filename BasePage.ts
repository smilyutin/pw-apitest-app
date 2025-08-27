import { Page, Locator } from '@playwright/test';

export class BasePage {
  // Navigation Elements
  readonly conduitHomeSignInSignUpNavigation: Locator;

  // Utility Elements
  readonly conduitLink: Locator;

  // Utility Elements
  readonly signInLink: Locator;

  constructor(private page: Page) {
    // Navigation Elements
    this.conduitHomeSignInSignUpNavigation = this.page.locator('.navbar');

    // Utility Elements
    this.conduitLink = this.page.getByRole('link', { name: "conduit" });

    // Utility Elements
    this.signInLink = this.page.getByRole('link', { name: "Sign in" });

  }

  // -------- Utilities --------
  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async waitForIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  // -------- Navigation Helpers (auto-generated) --------
  async gotoHome() { await this.conduitHomeSignInSignUpNavigation.click(); await this.waitForIdle(); }
  async clickConduitLink() { await this.conduitLink.click(); await this.waitForIdle(); }
  async gotoSignIn() { await this.signInLink.click(); await this.waitForIdle(); }
}
