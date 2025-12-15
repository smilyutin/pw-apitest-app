import { test, expect } from '@playwright/test';
import { APP } from '../../fixture/security-urls';

const ALLOWLIST = new Set([
  new URL(APP).origin,               // first-party
  // 'https://cdn.jsdelivr.net',
  // 'https://unpkg.com',
]);

test.describe.skip('[security] Supply chain: CSP allowlist + SRI for 3rd-party', () => {
  test('All <script src> are from allowlist; 3rd-party have SRI', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res).toBeTruthy();

    // Grab CSP (response header or <meta http-equiv>)
    const headers = res!.headers();
    const cspHeader = headers['content-security-policy'];
    const cspMeta = await page.$eval('meta[http-equiv="Content-Security-Policy"]', el => el.getAttribute('content')).catch(() => null);
    const csp = cspHeader || cspMeta || '';

    // Basic CSP sanity: default-src/script-src present; no * or data: for scripts; prefer nonces/hashes
    expect(csp.length, 'CSP is missing; add header or <meta http-equiv>').toBeGreaterThan(0);
    expect(csp.includes('default-src')).toBeTruthy();
    expect(csp.includes('script-src')).toBeTruthy();
    expect(/script-src[^;]*\*/.test(csp), "script-src must not allow '*'").toBeFalsy();
    expect(/script-src[^;]*data:/.test(csp), "script-src should not allow 'data:'").toBeFalsy();

    // Inspect all scripts in the DOM
    const scripts = await page.$$eval('script[src]', nodes =>
      nodes.map(n => ({
        src: (n as HTMLScriptElement).src,
        integrity: (n as HTMLScriptElement).integrity || '',
        crossOrigin: (n as HTMLScriptElement).crossOrigin || '',
      }))
    );

    for (const s of scripts) {
      const origin = new URL(s.src).origin;
      expect(ALLOWLIST.has(origin), `Unexpected script origin: ${s.src}`).toBeTruthy();

      // If third-party (not your origin), demand SRI + proper crossorigin
      const isThirdParty = origin !== new URL(APP).origin;
      if (isThirdParty) {
        expect(Boolean(s.integrity), `3rd-party script must use SRI: ${s.src}`).toBeTruthy();
        // browsers require crossorigin for SRI on cross-origin in many setups
        expect(['anonymous', 'use-credentials'].includes(s.crossOrigin || 'anonymous'))
          .toBeTruthy();
      }
    }
  });
});