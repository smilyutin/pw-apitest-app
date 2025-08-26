import { test, expect } from '@playwright/test';

const APP = process.env.APP_URL ?? 'https://conduit.bondaracademy.com';
const SOFT = process.env.SECURITY_SOFT === '1';

// soft assertion helper (let CI pass but still warn)
const expectSoft = (cond: boolean, msg: string) =>
  cond ? undefined : (SOFT ? console.warn(' [soft] ' + msg) : expect(cond, msg).toBe(true));

test.describe.skip('[security] Clickjacking headers & behavior', () => {
  test('Response has X-Frame-Options or CSP frame-ancestors', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res, 'navigation response exists').toBeTruthy();

    const headers = res!.headers();
    const xfo = headers['x-frame-options'];                 // e.g., DENY or SAMEORIGIN
    const csp = headers['content-security-policy'];         // look for frame-ancestors

    // At least one protection must exist
    const hasXFO = !!xfo && /deny|sameorigin/i.test(xfo);
    const faMatch = csp?.match(/frame-ancestors\s+([^;]+)/i);
    const hasFA = !!faMatch; // if present, it’s the modern way

    // Warn/fail if neither present
    expectSoft(
      hasXFO || hasFA,
      'Missing clickjacking protection: add X-Frame-Options: DENY/SAMEORIGIN or CSP "frame-ancestors".'
    );

    // If frame-ancestors is present, ensure it’s restrictive
    if (faMatch) {
      const faPolicy = faMatch[1].trim();
      // Typical safe values: 'none', 'self' (optionally specific trusted origins)
      const looksRestrictive = /'none'|'self'|https?:\/\//i.test(faPolicy);
      expectSoft(
        looksRestrictive,
        `CSP frame-ancestors looks unusual: "${faPolicy}". Use 'none', 'self', or explicit allowlist.`
      );
    }

    // If XFO present, sanity check value
    if (xfo) {
      expectSoft(
        /deny|sameorigin/i.test(xfo),
        `X-Frame-Options should be DENY or SAMEORIGIN, got "${xfo}".`
      );
    }
  });

  test('Page cannot be framed (functional check)', async ({ browser }) => {
    // We try to embed APP in an iframe. If protections are correct, the
    // frame should fail to navigate and stay about:blank (or error).
    const context = await browser.newContext();
    const page = await context.newPage();

    // Use a plain HTML data URL so the top page is same-origin and we can inspect frames list.
    const html = `<html><body>
      <iframe id="victim" src="${APP}" style="width:800px;height:600px;border:0;"></iframe>
    </body></html>`;
    await page.goto('data:text/html,' + encodeURIComponent(html));
    await page.waitForTimeout(1500); // small settle time

    const frames = page.frames();
    // Find a child frame that actually navigated to APP
    const victim = frames.find(f => f !== page.mainFrame() && f.url().startsWith(APP));

    // If we found a frame at the target URL, the site is framable (bad).
    // If not found (still about:blank / blocked), protection worked.
    expectSoft(
      !victim,
      `Page appears framable (no XFO/CSP enforcement). Iframe URL: ${frames
        .filter(f => f !== page.mainFrame())
        .map(f => f.url())
        .join(', ') || '(no child frame)'}`
    );

    await context.close();
  });
});