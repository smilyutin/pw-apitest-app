// tests/security/auth.cookies.spec.ts
import { test, expect, request as pwRequest } from '@playwright/test';
import fs from 'fs';

const APP_URL = 'https://conduit.bondaracademy.com';
const API_URL = 'https://conduit-api.bondaracademy.com';

// Cookie names that would indicate an auth/session cookie if they ever appear.
// Adjust or extend as your backend evolves.
const AUTH_COOKIE_NAME_PATTERNS = [/session/i, /auth/i, /token/i, /jwt/i, /sid/i];

function looksLikeAuthCookie(name: string) {
  return AUTH_COOKIE_NAME_PATTERNS.some(rx => rx.test(name));
}

function https(url: string) {
  return new URL(url).protocol === 'https:';
}

test.describe('Authentication & session cookie flags', () => {
  test.skip('No auth data in cookies; any cookies have safe flags', async ({ browser }) => {
    // Use your existing authenticated storage state to act as a logged-in user
    const storageStatePath = '.auth/user.json';
    expect(fs.existsSync(storageStatePath)).toBeTruthy();

    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    // --- Visit app (logged in via localStorage JWT) ---
    await page.goto(APP_URL);

    // Collect cookies for app and API origins (some libs set cookies on either)
    const cookies = await context.cookies();
    const appCookies   = cookies.filter(c => c.domain && APP_URL.includes(c.domain.replace(/^\./, '')));
    const apiCookies   = cookies.filter(c => c.domain && API_URL.includes(c.domain.replace(/^\./, '')));
    const allRelevant  = [...new Map([...appCookies, ...apiCookies].map(c => [c.name + '@' + c.domain, c])).values()];

    // 1) Assert NO auth/session cookie is present (since you use localStorage token)
    const authCookies = allRelevant.filter(c => looksLikeAuthCookie(c.name));
    expect(
      authCookies.length,
      `Expected NO auth/session cookie, but found: ${authCookies.map(c => `${c.name} (domain=${c.domain})`).join(', ')}`
    ).toBe(0);

    // 2) If any cookies exist (analytics, preferences, etc.), validate flags.
    // - HttpOnly: should be true for any server-managed sensitive cookie.
    //   For non-sensitive client-side cookies (e.g., theme), HttpOnly can be false.
    //   We enforce HttpOnly for anything that "looks auth-like" above already (must be absent).
    // - SameSite: Lax or Strict are safest; if None, then Secure MUST be true.
    // - Secure: MUST be true on HTTPS origins.
    for (const c of allRelevant) {
      // SameSite check
      const sameSite = c.sameSite; // 'Strict' | 'Lax' | 'None'
      const sameSiteOk =
        sameSite === 'Lax' ||
        sameSite === 'Strict' ||
        (sameSite === 'None' && c.secure === true);
      expect(
        sameSiteOk,
        `[${c.name}] Invalid SameSite=${sameSite}. If 'None', cookie must be Secure=true.`
      ).toBeTruthy();

      // Secure on HTTPS
      if (https(`https://${c.domain?.replace(/^\./, '') || ''}`)) {
        expect(
          c.secure,
          `[${c.name}] Secure flag must be true on HTTPS (domain=${c.domain}).`
        ).toBeTruthy();
      }

      // If a cookie *does* look sensitive in the future, ensure HttpOnly
      if (looksLikeAuthCookie(c.name)) {
        expect(
          c.httpOnly,
          `[${c.name}] HttpOnly must be true for auth/session cookies.`
        ).toBeTruthy();
      }
    }

    await context.close();
  });

  test('Login API does not leak cookies or, if present, has safe attributes', async () => {
    // Sanity: login via API (same as your setup) to inspect response headers
    const ctx = await pwRequest.newContext({ baseURL: API_URL });
    const res = await ctx.post('/api/users/login', {
      data: { user: { email: '1pwtest101@test.com', password: '1pwtest101@test.com' } },
      headers: { 'content-type': 'application/json' },
    });

    expect(res.ok()).toBeTruthy();

    // If backend ever starts setting cookies, validate them
    const setCookie = res.headers()['set-cookie'];
    if (setCookie) {
      // Very basic parsing: split multiple cookies
      const cookieStrings = Array.isArray(setCookie) ? setCookie : [setCookie];
      for (const raw of cookieStrings) {
        const lower = raw.toLowerCase();

        // If cookie is SameSite=None then Secure must be present
        if (lower.includes('samesite=none')) {
          expect(lower.includes('secure'), `Set-Cookie missing Secure when SameSite=None: ${raw}`).toBeTruthy();
        }

        // Suggest HttpOnly for any cookie that might be sensitive
        const cookieName = raw.split(';')[0].split('=')[0].trim();
        if (looksLikeAuthCookie(cookieName)) {
          expect(lower.includes('httponly'), `Auth-like cookie must be HttpOnly: ${raw}`).toBeTruthy();
        }
      }
    }
    await ctx.dispose();
  });
});