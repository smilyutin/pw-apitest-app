// tests/security/headers/permissions-policy.spec.ts
import { test, expect } from '@playwright/test';

const APP = 'https://conduit.bondaracademy.com';

// Soft mode: SECURITY_SOFT=1 lets CI pass but logs warnings.
const SOFT = process.env.SECURITY_SOFT === '1';
function expectSoft(ok: boolean, msg: string) {
  if (!ok) {
    if (SOFT) console.warn('⚠️ [soft] ' + msg);
    else throw new Error(msg);
  }
}

// High-risk features we prefer explicitly disabled unless there is a business need.
const SENSITIVE = ['camera', 'microphone', 'geolocation'];

// Parse a Permissions-Policy header string into {feature -> valueRaw}
function parsePermissionsPolicy(value: string) {
  // Format examples:
  //  - camera=()
  //  - geolocation=("https://example.com")
  //  - fullscreen=(self "https://a.com")
  //  - interest-cohort=()  (a.k.a. FLoC off)
  const map = new Map<string, string>();
  for (const part of value.split(',').map(s => s.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim(); // keep raw to check for *, ()
    map.set(k, v);
  }
  return map;
}

test.describe('[security-headers] Permissions-Policy', () => {
  test('Response sends a Permissions-Policy header with sane directives', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res, 'Navigation should succeed').toBeTruthy();

    const h = res!.headers();
    // Browsers use "permissions-policy" (lower-case). Old name "feature-policy" is obsolete.
    const value = (h['permissions-policy'] || h['permission-policy'] || h['feature-policy'] || '').trim();

    // Must exist (prefer the modern name).
    expect(
      value,
      'Missing Permissions-Policy header. Example: camera=(), microphone=(), geolocation=()'
    ).toBeTruthy();

    // Basic parsing & validation
    const directives = parsePermissionsPolicy(value);
    expectSoft(directives.size > 0, `Unparseable Permissions-Policy: "${value}"`);

    // 1) Disallow wildcards like: camera=*
    for (const [feature, raw] of directives.entries()) {
      const hasWildcard = /\*\)?$/.test(raw) || raw === '*';
      expectSoft(!hasWildcard, `Directive "${feature}=${raw}" is too permissive; avoid "*" wildcard.`);
    }

    // 2) Recommend disabling sensitive features unless required
    for (const f of SENSITIVE) {
      if (!directives.has(f)) {
        console.warn(`⚠️ [soft] No "${f}" directive present. Consider "${f}=()" to disable.`);
        continue;
      }
      const raw = directives.get(f)!;
      // The safest default is empty allowlist: ()
      const isDisabled = /^\(\s*\)$/.test(raw);
      expectSoft(
        isDisabled,
        `Sensitive feature "${f}" is not disabled: "${f}=${raw}". Prefer "${f}=()".`
      );
    }

    // 3) Spot obvious mistakes (wrong separators or missing parens)
    // Valid values are like: (), (self), ("https://a.com"), (self "https://a.com")
    for (const [feature, raw] of directives.entries()) {
      const looksValid = /^\(.*\)$/.test(raw);
      expectSoft(
        looksValid,
        `Directive "${feature}=${raw}" looks malformed. Wrap allowlist in parentheses, e.g. ${feature}=(self "https://example.com").`
      );
    }
  });
});