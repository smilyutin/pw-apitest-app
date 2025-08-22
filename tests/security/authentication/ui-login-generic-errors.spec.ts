// tests/security/authentication/ui-login-generic-errors.spec.ts
import { test, expect } from '@playwright/test';
import path from 'path';

const APP = 'https://conduit.bondaracademy.com';

test.describe.skip('[security] Generic error messages in UI login', () => {
  // Force logged-out context just for this file
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Same error for wrong password and unknown email', async ({ page }, testInfo) => {
    const snap = async (name: string) =>
      page.screenshot({ path: path.join(testInfo.outputDir, `${name}.png`), fullPage: true });

    await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login$/);

    // --- Case A: existing email + wrong password ---
    await page.getByRole('textbox', { name: /email/i }).fill('1pwtest101@test.com');
    await page.getByRole('textbox', { name: /password/i }).fill('definitely-wrong');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // Use pure CSS and assert the text on that node
    const caseAError = page.locator('ul.error-messages li').first();
    await expect(caseAError).toBeVisible({ timeout: 10_000 });
    await expect(caseAError).toHaveText(/email or password is invalid/i, { timeout: 10_000 });
    const textA = (await caseAError.innerText()).trim();

    // --- Case B: unknown email + any password ---
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: /email/i }).fill(`no_such_user_${Date.now()}@example.com`);
    await page.getByRole('textbox', { name: /password/i }).fill('some-password');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const caseBError = page.locator('ul.error-messages li').first();
    await expect(caseBError).toBeVisible({ timeout: 10_000 });
    await expect(caseBError).toHaveText(/email or password is invalid/i, { timeout: 10_000 });
    const textB = (await caseBError.innerText()).trim();

    // Same generic message in both cases:
    expect(textB.toLowerCase()).toBe(textA.toLowerCase());

    // Still on /login (was not logged in)
    await expect(page).toHaveURL(/\/login$/);

    await snap('login-generic-errors-ok');
  });
});