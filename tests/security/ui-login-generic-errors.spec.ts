import { test, expect } from '@playwright/test';

const APP = 'https://conduit.bondaracademy.com';

test.describe('[security] Generic error messages in UI login', () => {
  test('Same error for wrong password and unknown email', async ({ page }) => {
    await page.goto(APP);

    await page.getByRole('link', { name: /sign in/i }).click();

    // Case A: existing email + wrong password
    await page.getByRole('textbox', { name: /email/i }).fill('1pwtest101@test.com');
    await page.getByRole('textbox', { name: /password/i }).fill('definitely-wrong');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const errA = await page.locator('.error-messages, .ng-invalid, .error, text=/error/i').first().textContent().catch(()=>'');
    await page.waitForTimeout(300);

    // Case B: unknown email + any password
    await page.getByRole('textbox', { name: /email/i }).fill(`nope_${Date.now()}@example.com`);
    await page.getByRole('textbox', { name: /password/i }).fill('somepass123!');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const errB = await page.locator('.error-messages, .ng-invalid, .error, text=/error/i').first().textContent().catch(()=>'');
    await page.waitForTimeout(300);

    // Normalize whitespace
    const norm = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Errors should be equally vague
    expect(norm(errA).length > 0).toBeTruthy();
    expect(norm(errB).length > 0).toBeTruthy();
    expect(norm(errA)).toBe(norm(errB));
  });
});