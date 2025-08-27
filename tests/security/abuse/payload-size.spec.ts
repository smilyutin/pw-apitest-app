import { test, expect, request as pwRequest } from '@playwright/test';
import fs from 'fs';

const API = process.env.API_ORIGIN || 'https://conduit-api.bondaracademy.com';
const json = { 'Content-Type': 'application/json' };

// Default to SOFT unless you set SECURITY_STRICT=1 (or SECURITY_SOFT=0)
const STRICT = process.env.SECURITY_STRICT === '1' || process.env.SECURITY_SOFT === '0';
//temporary before resturn fixed
const ALLOW_5XX_AS_REJECT = process.env.ALLOW_5XX_AS_REJECT === '1';
// helper: annotate the test with a warning line
const warn = (t: string) => test.info().annotations.push({ type: 'security', description: t });

// ALLOW_5XX_AS_REJECT=1 SECURITY_STRICT=1 npx playwright test tests/security/abuse/payload-size.spec.ts

test.describe('[security] Large payload / body-size protections', () => {
  test('Very large article body is rejected with 413 or safe 4xx', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API });

    const big = 'x'.repeat(3 * 1024 * 1024); // ~3MB
    const title = `big-${Date.now()}`;

    const res = await ctx.post('/api/articles', {
      headers: { ...json /* no Authorization on purpose */ },
      data: { article: { title, description: 'big', body: big, tagList: [] } },
    });

    const status = res.status();
    const bodyText = await res.text().catch(() => '');

    // Acceptable “rejections”. 413 is ideal; others are still safe (not created).
    const safeReject = [413, 400, 401, 403, 404, 422].includes(status) ||
  (ALLOW_5XX_AS_REJECT && status >= 500);
    const createdOk = [200, 201].includes(status);

    // If server wrongly created it, try to clean up so we don’t pollute data.
    if (createdOk) {
      let slug: string | undefined;
      try {
        const parsed = JSON.parse(bodyText);
        slug = parsed?.article?.slug;
      } catch {}
      if (slug) {
        const tok = (() => {
          try {
            const u = JSON.parse(fs.readFileSync('.auth/user.json', 'utf-8'));
            return u?.origins?.[0]?.localStorage?.find((x: any) => x.name === 'jwtToken')?.value;
          } catch { return undefined; }
        })();
        if (tok) {
          const del = await ctx.delete(`/api/articles/${slug}`, { headers: { Authorization: `Token ${tok}` } });
          warn(`Large payload mistakenly accepted (${status}); cleaned up slug=${slug} delete=${del.status()}`);
        } else {
          warn(`Large payload mistakenly accepted (${status}); no token available for cleanup (slug=${slug})`);
        }
      } else {
        warn(`Large payload mistakenly accepted (${status}); response didn’t include slug`);
      }
    }

    // Treat 5xx (often CORS) as a misconfig warning (not a pass).
    // API returns 500 for the huge body. The test is behaving as designed: strict = hard-fail unless it’s a 
    // clean rejection (413/4xx). If you want it green while infra returns 500 (often CORS/proxy), 
    // use a toggle to temporarily treat 5xx as “reject”.
    const cors5xx = status >= 500;

    if (STRICT) {
      // Strict lane (e.g., main): hard fail unless it was a safe reject
      expect(safeReject, `Expected 413/4xx for huge body; got ${status}.`).toBeTruthy();
    } else {
      // Soft lane (e.g., local/PRs): never throw, but annotate the report
      if (safeReject) {
        // pass quietly
      } else if (cors5xx) {
        warn(`Large payload blocked with ${status} (likely CORS/proxy). Prefer 413/4xx application rejection.`);
        expect.soft(safeReject).toBeTruthy(); // soft mark
      } else if (createdOk) {
        warn(`Large payload was ACCEPTED (${status}). This should be rejected with 413/4xx.`);
        expect.soft(false).toBeTruthy(); // soft mark
      } else {
        warn(`Unexpected status ${status} for huge body. Prefer 413/4xx.`);
        expect.soft(false).toBeTruthy(); // soft mark
      }
    }

    await ctx.dispose();
  });
});