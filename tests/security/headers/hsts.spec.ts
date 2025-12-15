import { test, expect } from '@playwright/test';
import { APP } from '../../fixture/security-urls';

// Soft mode: SECURITY_SOFT=1 lets CI pass while still logging warnings.
const SOFT = process.env.SECURITY_SOFT === '1';
const expectSoft = (ok: boolean, msg: string) => {
  if (!ok) {
    if (SOFT) console.warn('⚠️ [soft] ' + msg);
    else throw new Error(msg);
  }
};

function parseHsts(value: string) {
  // e.g. "max-age=31536000; includeSubDomains; preload"
  const parts = value.split(';').map(p => p.trim()).filter(Boolean);
  const out: Record<string, string | boolean> = {};
  for (const p of parts) {
    const [kRaw, vRaw] = p.split('=');
    const k = kRaw.trim().toLowerCase();
    if (typeof vRaw === 'undefined') {
      out[k] = true;
    } else {
      out[k] = vRaw.trim();
    }
  }
  return out;
}

test.describe('[security-headers] HSTS', () => {
  test('Strict-Transport-Security header is present and strong', async ({ page }) => {
    // Must be HTTPS for HSTS to be meaningful
    // Ensure APP uses https:// protocol
    const url = APP.startsWith('https://') ? APP : APP.replace(/^http:/, 'https:');
    
    const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
    expect(res, 'Navigation should succeed').toBeTruthy();

    const headers = res!.headers();
    // header keys are lowercased in Playwright
    const hsts = headers['strict-transport-security'];

    expectSoft(
      !!hsts,
      'Missing Strict-Transport-Security header on HTTPS response.'
    );

    if (!hsts) {
      if (!SOFT) {
        throw new Error('HSTS header missing - cannot proceed with validation');
      }
      return; // Skip remaining checks in soft mode
    }

    const parsed = parseHsts(hsts);
    const maxAgeRaw = parsed['max-age'];
    const includeSub = !!parsed['includesubdomains']; // header token is includeSubDomains
    const preload = !!parsed['preload'];

    // 1) max-age sanity: at least 6 months (15552000); 1 year better (31536000)
    const maxAge = Number(maxAgeRaw);
    expectSoft(
      Number.isFinite(maxAge) && maxAge >= 15552000,
      `HSTS max-age too low or missing: "${hsts}". Recommend >= 31536000.`
    );

    // 2) includeSubDomains recommended
    expectSoft(
      includeSub,
      `HSTS missing "includeSubDomains": "${hsts}".`
    );

    // 3) preload optional but recommended if you plan to preload
    if (!preload) {
      console.warn(' [soft] HSTS missing "preload". Add if you intend to submit to preload list.');
    }
  });
});