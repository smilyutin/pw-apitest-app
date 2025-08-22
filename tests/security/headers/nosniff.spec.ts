// tests/security/headers/nosniff.spec.ts
import { test, expect } from '@playwright/test';

const APP = 'https://conduit.bondaracademy.com';

test.describe('[security-headers] X-Content-Type-Options', () => {
  test('Response must send X-Content-Type-Options: nosniff', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res, 'Navigation should succeed').toBeTruthy();

    const headers = res!.headers();
    const nosniff = headers['x-content-type-options'];

    expect(nosniff, 'Missing X-Content-Type-Options header').toBeTruthy();
    expect(nosniff?.toLowerCase()).toBe('nosniff');
  });
});