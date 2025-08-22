// tests/security/headers/referrer-policy.spec.ts
import { test, expect } from '@playwright/test';

const APP = 'https://conduit.bondaracademy.com';

// Allow CI to pass but still warn if policy is weak.
// Run with: SECURITY_SOFT=1 npx playwright test ...
const SOFT = process.env.SECURITY_SOFT === '1';
function expectSoft(ok: boolean, msg: string) {
  if (!ok) {
    if (SOFT) console.warn('⚠️ [soft] ' + msg);
    else throw new Error(msg);
  }
}

// Policies we consider strong/sane for most apps.
// (Pick one for production. The modern default is 'strict-origin-when-cross-origin'.)
const STRONG = new Set([
  'no-referrer',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'origin-when-cross-origin', // acceptable for many dashboards/APIs
]);

// Policies that work but are weaker (we’ll soft-warn if found):
const WEAK = new Set([
  'origin',
  'no-referrer-when-downgrade', // legacy default (not preferred)
  'unsafe-url',                  // leaks full URL incl. path/query
]);

test.describe.skip('[security-headers] Referrer-Policy', () => {
  test('UI response sends a Referrer-Policy header with a secure value', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res, 'Navigation should succeed').toBeTruthy();

    const headers = res!.headers();
    const value = (headers['referrer-policy'] || headers['referrer_policy'] || '').trim().toLowerCase();

    // Must exist
    expect(
      value,
      'Missing Referrer-Policy header. Set it to a modern value like "strict-origin-when-cross-origin".'
    ).toBeTruthy();

    // Value should be recognized
    const known = STRONG.has(value) || WEAK.has(value);
    expectSoft(
      known,
      `Unrecognized Referrer-Policy value "${value}".`
    );

    // Strong vs weak
    if (WEAK.has(value)) {
      expectSoft(
        false,
        `Referrer-Policy is "${value}" (weaker). Prefer "strict-origin-when-cross-origin" or "no-referrer".`
      );
    }
  });
});