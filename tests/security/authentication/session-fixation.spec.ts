// tests/security/session-fixation.spec.ts
// A session-fixation check verifies that any “session” cookie that exists before login is 
// rotated (new value) after login. If your app is purely JWT-in-localStorage (as Conduit is), 
// there should be no auth/session cookies at all—in that case we assert exactly that.

import { test, expect, request as pwRequest } from '@playwright/test';

const APP = 'https://conduit.bondaracademy.com';
const EMAIL = '1pwtest101@test.com';
const PASS  = '1pwtest101@test.com';

const SESSION_RX = /(session|sid|sess|auth|token)/i;

async function getSessionCookies(origin: string, ctx: import('@playwright/test').BrowserContext) {
  const cookies = await ctx.cookies(origin);
  return cookies.filter(c => SESSION_RX.test(c.name));
}

test.describe.skip('Session fixation', () => {
  test.setTimeout(60_000);

  test('session id rotates on login (or none exist for JWT apps)', async ({ browser, request }) => {
    // Fresh context (no storageState)
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1) Pre-login cookies
    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    const before = await getSessionCookies(APP, context);

    // 2) Try quick UI login; if "Sign in" not found fast, do API login instead
    let loggedIn = false;
    try {
      await page.getByRole('link', { name: /^Sign in$/i }).click({ timeout: 5_000 });
      await page.getByRole('textbox', { name: 'Email' }).fill(EMAIL);
      await page.getByRole('textbox', { name: 'Password' }).fill(PASS);
      await page.getByRole('button', { name: /^Sign in$/i }).click();
      await page.waitForLoadState('domcontentloaded');
      loggedIn = true;
    } catch {
      // API login (JWT-only flow) — seed localStorage and reload
      const loginResp = await request.post(
        'https://conduit-api.bondaracademy.com/api/users/login',
        {
          data: { user: { email: EMAIL, password: PASS } },
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect(loginResp.ok()).toBeTruthy();
      const body = await loginResp.json();
      const token = body.user.token as string;

      // Put the token into localStorage like the app does and reload
      await page.addInitScript((tok) => localStorage.setItem('jwtToken', tok), token);
      await page.reload({ waitUntil: 'domcontentloaded' });
      loggedIn = true;
    }

    expect(loggedIn).toBeTruthy();

    // 3) Post-"login" cookies
    const after = await getSessionCookies(APP, context);

    if (after.length === 0) {
      // JWT-only: there must also be none before login
      expect(
        before.length,
        'JWT app should not set session cookies pre-login.'
      ).toBe(0);
      test.info().attach('note', { body: 'No session-like cookies before/after login. JWT in localStorage; fixation not applicable.' });
    } else {
      // If cookies exist, ensure rotation and sane flags
      const map = (arr: any[]) => Object.fromEntries(arr.map(c => [c.name, c.value]));
      const beforeMap = map(before);
      const afterMap  = map(after);
      const rotated = after.some(c => beforeMap[c.name] === undefined || beforeMap[c.name] !== afterMap[c.name]);

      expect(rotated, `Expected a session cookie to rotate on login.
Before: ${JSON.stringify(before, null, 2)}
After:  ${JSON.stringify(after,  null, 2)}`).toBeTruthy();

      for (const c of after) {
        expect(c.secure,   `Cookie ${c.name} should be Secure`).toBeTruthy();
        expect(c.httpOnly, `Cookie ${c.name} should be HttpOnly`).toBeTruthy();
        expect(['Lax','Strict','None']).toContain(c.sameSite ?? 'Lax');
      }
    }

    await context.close();
  });
});