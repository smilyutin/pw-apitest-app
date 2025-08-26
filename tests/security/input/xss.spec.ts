import { test, expect, request as pwRequest } from '@playwright/test';
import { accessToken } from '../../../utils/token';
//npx playwright test tests/security/input/xss.spec.ts -g "URL-injection"
// Target app/API
const APP = 'https://conduit.bondaracademy.com';
const API = 'https://conduit-api.bondaracademy.com';

// Soft mode lets CI pass but still logs a warning
const SOFT = process.env.SECURITY_SOFT === '1';
const json = { 'Content-Type': 'application/json' };

function expectSoft(cond: boolean, msg: string) {
  if (!cond) {
    if (SOFT) console.warn('[soft] ' + msg);
    else throw new Error(msg);
  }
}

async function api() {
  return pwRequest.newContext({ baseURL: API });
}

// A few payloads you can rotate through
const PAYLOADS = [
  `<script>window.__pwned__='S1'</script>`,
  `"><img src=x onerror="window.__pwned__='S2'">`,
  `<svg/onload=window.__pwned__='S3'>`,
];

test.describe.skip('[security] XSS (stored & basic URL injection)', () => {
  test('Stored XSS: article title/body must not execute HTML/JS', async ({ page }) => {
    const ctx = await api();
    const payload = PAYLOADS[1]; // onerror payload is a good canary
    const ts = Date.now();
    const title = `XSS-Title-${ts} ${payload}`;
    const body = `XSS-Body-${ts}\n${payload}\nplain text`;

    // 1) Create article via API (authenticated)
    const create = await ctx.post('/api/articles', {
      headers: { ...json, Authorization: `Token ${accessToken}` },
      data: { article: { title, description: 'xss test', body, tagList: [] } },
    });
    expect(create.status()).toBe(201);
    const { article } = await create.json();
    const slug = article.slug;

    // Guard: flag any unexpected script execution
    await page.addInitScript(() => {
      (window as any).__pwned__ = undefined;
      // neuter alert/prompt if app tries to call
      const n = (name: keyof Window & string) => {
        try { (window as any)[name] = () => {}; } catch {}
      };
      n('alert'); n('confirm'); n('prompt');
    });

    // 2) View article page (potential execution point)
    await page.goto(`${APP}/article/${slug}`, { waitUntil: 'domcontentloaded' });

    // 3) Assert no execution happened
    const executed = await page.evaluate(() => (window as any).__pwned__);
    expectSoft(!executed, `Stored XSS executed in article view (marker: ${executed})`);

    // 4) Page should render payload as text (or strip), not as live elements
    //    - there should not be new inline <script> tags created by our payload
    const scriptsCount = await page.locator('article script').count();
    expectSoft(scriptsCount === 0, `Unexpected <script> tag(s) inside article content: ${scriptsCount}`);

    // 5) Optional: text presence as literal (may be escaped visually). If your renderer strips tags, this may not match.
    // We check that the raw payload isn't creating attributes/nodes:
    const hasOnerrorAttr = await page.locator('article [onerror]').count();
    expectSoft(hasOnerrorAttr === 0, 'Payload created an element with onerror attribute (should be escaped/sanitized).');

    // Cleanup
    await ctx.delete(`/api/articles/${slug}`, { headers: { Authorization: `Token ${accessToken}` } }).catch(() => {});
    await ctx.dispose();
  });

  test('Stored XSS: comment must not execute HTML/JS', async ({ page }) => {
    const ctx = await api();
    const ts = Date.now();
    const payload = PAYLOADS[0]; // <script> marker
    // Create host article
    const create = await ctx.post('/api/articles', {
      headers: { ...json, Authorization: `Token ${accessToken}` },
      data: { article: { title: `Host-${ts}`, description: 'host', body: 'host', tagList: [] } },
    });
    expect(create.status()).toBe(201);
    const slug = (await create.json()).article.slug;

    await page.addInitScript(() => { (window as any).__pwned__ = undefined; });
    await page.goto(`${APP}/article/${slug}`, { waitUntil: 'domcontentloaded' });

    // Post a comment via UI (where client rendering can be vulnerable)
    await page.getByRole('textbox', { name: /write a comment/i }).fill(`Comment-${ts} ${payload}`);
    await page.getByRole('button', { name: /^post comment$/i }).click();

    // Wait for comment to appear
    const commentCard = page.locator('.card-text', { hasText: `Comment-${ts}` });
    await expect(commentCard).toBeVisible();

    const executed = await page.evaluate(() => (window as any).__pwned__);
    expectSoft(!executed, `Stored XSS executed from comment (marker: ${executed})`);

    const commentScripts = await page.locator('.card-text script').count();
    expectSoft(commentScripts === 0, `Unexpected <script> tag(s) inside comment: ${commentScripts}`);

    // Cleanup host article (comments go with it)
    await ctx.delete(`/api/articles/${slug}`, { headers: { Authorization: `Token ${accessToken}` } }).catch(() => {});
    await ctx.dispose();
  });

  test('Basic URL-injection probe: payload in URL should not execute', async ({ page }) => {
    // Canary + neuter popups
    await page.addInitScript(() => {
      (window as any).__pwned__ = undefined;
      try { window.alert = () => {}; window.confirm = () => false; window.prompt = () => null; } catch {}
    });

    // Helper: count *inline* scripts (no src) and inline event-handler attrs
    const countHazards = async () => {
      return await page.evaluate(() => {
        const inlineScripts = Array.from(document.querySelectorAll('script'))
          .filter(s => !s.hasAttribute('src')).length;

        // any element with inline on* handler (onclick, onload, etc.)
        const onAttrRx = /^on[a-z]+$/i;
        const hasInlineHandlers = Array.from(document.querySelectorAll<HTMLElement>('*'))
          .some(el => Array.from(el.attributes).some(a => onAttrRx.test(a.name)));

        return { inlineScripts, hasInlineHandlers };
      });
    };

    // 1) Baseline on a safe URL
    await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
    const baseline = await countHazards();

    // 2) Hit URL with an injection payload in the query
    const payload = encodeURIComponent(`"><img src=x onerror="window.__pwned__='URL'">`);
    await page.goto(`${APP}/?q=${payload}`, { waitUntil: 'domcontentloaded' });

    const executed = await page.evaluate(() => (window as any).__pwned__);
    const after = await countHazards();

    // 3) Assertions (soft if SECURITY_SOFT=1)
    expectSoft(!executed, `URL-based XSS executed (marker: ${executed})`);

    // Inline scripts should not *increase* compared to baseline
    expectSoft(
      after.inlineScripts <= baseline.inlineScripts,
      `Inline <script> count increased (baseline=${baseline.inlineScripts}, now=${after.inlineScripts}).`
    );

    // No new inline event handlers should appear
    expectSoft(
      !after.hasInlineHandlers,
      'Inline event handler attribute(s) detected after URL injection (e.g., onclick=).'
    );
  });
});