// tests/security/xss-csp-storage.spec.ts
import { test, expect } from '@playwright/test';
import { APP } from '../../fixture/security-urls';

// Pages worth scanning; add more as needed.
const PAGES = [
  '/',                // home / feed
  '/editor',          // new article
  '/settings',        // settings
  '/profile/1pwtest101', // public profile (adjust if needed)
].map(p => APP.replace(/\/$/, '') + p);

/**
 * Very small “lint” for inline script hazards:
 *  - <script> blocks without a src attribute (inline JS)
 *  - inline event handlers like onclick=, onload=, etc.
 */
function findInlineScriptIssues(html: string) {
  const issues: string[] = [];

  // 1) <script> without src
  const inlineScriptRx = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = inlineScriptRx.exec(html))) {
    const snippet = m[0].slice(0, 160).replace(/\s+/g, ' ');
    issues.push(`Inline <script> detected: ${snippet}…`);
  }

  // 2) Inline event handlers (onclick, onload, onerror, etc.)
  const inlineHandlerRx =
    /\bon(?:abort|auxclick|beforeinput|blur|change|click|contextmenu|copy|cut|dblclick|drag|drop|error|focus|input|keydown|keypress|keyup|load|mousedown|mouseenter|mouseleave|mousemove|mouseout|mouseover|mouseup|paste|reset|resize|scroll|select|submit|touch|wheel)\s*=/gi;
  if (inlineHandlerRx.test(html)) {
    issues.push('Inline event handler attribute detected (e.g. onclick=, onload=, …)');
  }

  return issues;
}

test.describe.skip('Security hardening: XSS, CSP, and storage hygiene', () => {
  test('CSP header is present & sane on the main document', async ({ page }) => {
  const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
  expect(res, 'Navigation response should exist').toBeTruthy();

  const headers = await res!.headers();
  const csp = headers['content-security-policy'];

  if (!csp) {
    if (process.env.CI) {
      // In CI: break the build
      expect(
        csp,
        'Missing Content-Security-Policy header (add a CSP to reduce XSS risk).'
      ).toBeTruthy();
    } else {
      // In local/dev: warn only
      console.warn(`[SECURITY] Missing CSP header on ${APP}`);
    }
    return;
  }

  // Minimal sanity checks; tighten as you harden CSP
  expect(csp).toContain('default-src');
  expect(
    /script-src[^;]*'unsafe-inline'/.test(csp),
    "CSP 'script-src' should avoid 'unsafe-inline' (use nonces or hashes)."
  ).toBeFalsy();
});
  test('No inline script or event-handler hazards (basic XSS lint)', async ({ page }) => {
    for (const url of PAGES) {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
      expect(res?.ok(), `Failed to load ${url}`).toBeTruthy();

      const html = await page.content();
      const issues = findInlineScriptIssues(html);

      expect(
        issues.length,
        `Inline-script hazards on ${url}:\n- ${issues.join('\n- ')}`
      ).toBe(0);
    }
  });

  test('LocalStorage contains only jwtToken (no extra secrets)', async ({ page, context }) => {
    await page.goto(APP);

    // Read localStorage on the web origin
    const { keys, kv } = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const kv: Record<string, string> = {};
      for (const k of keys) kv[k] = localStorage.getItem(k) ?? '';
      return { keys, kv };
    });

    // Allow list: only jwtToken should be present
    const allow = new Set(['jwtToken']);
    const unexpected = keys.filter(k => !allow.has(k));

    expect(
      unexpected.length,
      `localStorage should only contain 'jwtToken'. Found extra keys: ${unexpected.join(', ')}.\n` +
        `Values (redact before sharing): ${JSON.stringify(kv, null, 2)}`
    ).toBe(0);

    expect(
      (kv['jwtToken'] || '').length > 10,
      'jwtToken is missing or suspiciously short.'
    ).toBeTruthy();

    // Also assert no auth/session cookies sneaked in
    const cookies = await context.cookies(APP);
    const authish = cookies.filter(c => /(auth|token|jwt|session|sid)/i.test(c.name));
    expect(
      authish.length,
      `Found auth-like cookie(s) on ${APP}: ${authish.map(c => c.name).join(', ')}`
    ).toBe(0);
  });
});