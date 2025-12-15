//test verifies UI sets a Content-Security-Policy and that it avoids the dangerous bits like unsafe-inline/unsafe-eval
import { test, expect } from '@playwright/test';
import { APP } from '../../fixture/security-urls';
//SECURITY_SOFT=1 npx playwright test tests/headers/csp.spec.ts
const SOFT = process.env.SECURITY_SOFT === '1'; // soft-warn instead of fail hard

function soft(cond: boolean, msg: string) {
  if (!cond) {
    if (SOFT) console.warn(' [soft] ' + msg);
    else throw new Error(msg);
  }
}

type CSPMap = Record<string, string[]>;

function parseCsp(header: string | undefined): CSPMap {
  const map: CSPMap = {};
  if (!header) return map;
  for (const part of header.split(';')) {
    const seg = part.trim();
    if (!seg) continue;
    const [dir, ...vals] = seg.split(/\s+/);
    map[dir.toLowerCase()] = vals;
  }
  return map;
}

async function getCspFromPage(page: import('@playwright/test').Page): Promise<{header?: string; meta?: string}> {
  // Prefer response header from the navigation request
  let cspHeader: string | undefined;
  page.once('response', (response) => {
    if (response.url() === page.url()) {
      cspHeader = response.headers()['content-security-policy'];
    }
  });
  const cspMeta = await page.evaluate(() => {
    const el = document.querySelector('meta[http-equiv="Content-Security-Policy"]') as HTMLMetaElement | null;
    return el?.content || undefined;
  });
  const csp = cspHeader || cspMeta || '';
  return { header: cspHeader, meta: cspMeta };
}

test.describe('[security] Content-Security-Policy', () => {
  // Add more UI routes here if useful
  const PAGES = ['/', '/login', '/editor'];

  for (const route of PAGES) {
    test(`CSP present & sane on ${route}`, async ({ page }) => {
      const url = APP.replace(/\/$/, '') + route;
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      expect(resp, 'Navigation response exists').toBeTruthy();

      const { header, meta } = await getCspFromPage(page);
      const cspRaw = header || meta;
      soft(!!cspRaw, `Missing Content-Security-Policy on ${url}. Add a CSP header (preferred) or meta tag.`);

      if (!cspRaw) return; // in soft mode, continue test run

      const csp = parseCsp(cspRaw);

      // --- Baseline directives we want to see
      soft('default-src' in csp, `CSP on ${url} should include default-src`);
      // object-src 'none' blocks legacy plugins and is recommended by Mozilla
      soft(csp['object-src']?.includes("'none'") ?? false, `CSP on ${url} should set object-src 'none'`);
      // base-uri controls <base>; should generally be 'self'
      soft(csp['base-uri']?.some(v => v === "'self'" || v === APP) ?? false, `CSP on ${url} should set base-uri 'self'`);

      // --- Script policy checks
      const scripts = csp['script-src'] ?? csp['default-src'] ?? [];
      const hasUnsafeInline = scripts.some(v => v === "'unsafe-inline'");
      const hasUnsafeEval   = scripts.some(v => v === "'unsafe-eval'");
      const hasNonce        = scripts.some(v => v.startsWith("'nonce-"));
      const hasHash         = scripts.some(v => /^'sha(256|384|512)-/i.test(v));
      const hasStrictDyn    = scripts.includes("'strict-dynamic'");

      // Avoid unsafe-inline unless you also use nonces/hashes (transition period)
      soft(!(hasUnsafeInline && !hasNonce && !hasHash),
        `CSP on ${url}: avoid 'unsafe-inline' for scripts; prefer nonces/hashes (and optionally 'strict-dynamic').`);
      // Avoid unsafe-eval if possible
      soft(!hasUnsafeEval, `CSP on ${url}: avoid 'unsafe-eval'`);

      // --- Optional: frame-ancestors (clickjacking)
      const fa = csp['frame-ancestors'];
      soft(!!fa, `CSP on ${url} should include frame-ancestors (or X-Frame-Options).`);
      if (fa) {
        // recommend none or trusted origins only
        const safe = fa.includes("'none'") || fa.some(v => v === "'self'" || v.startsWith('https://'));
        soft(safe, `CSP frame-ancestors on ${url} should be 'none', 'self', or a tight allowlist.`);
      }

      // --- Bonus sanity: if CSP claims to use nonces, inline <script> should carry them
      if (hasNonce) {
        const inlineScripts = await page.$$eval('script:not([src])', els =>
          (els as HTMLScriptElement[]).map(e => e.getAttribute('nonce') || '')
        );
        const allHaveNonce = inlineScripts.every(n => !!n);
        soft(allHaveNonce, `CSP on ${url} advertises nonces; inline <script> should include matching nonce attributes.`);
      }
    });
  }
});