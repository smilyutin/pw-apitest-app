import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import { API } from '../../fixture/security-urls';
//npx playwright test tests/security/input/sqli-nosqli.spec.ts
const SOFT = process.env.SECURITY_SOFT === '1';
const json = { 'Content-Type': 'application/json' };

// Common DB error signatures to guard against (extend as needed)
const ERROR_SIGNATURES = [
  /sqlstate/i,
  /syntax error/i,
  /unclosed quotation mark/i,
  /unterminated quoted string/i,
  /you have an error in your sql syntax/i,
  /psql:/i,
  /pg::/i,
  /mysql/i,
  /sqlite/i,
  /sequelize/i,
  /prisma/i,
  /mongodb/i,
  /mongoerror/i,
  /bson/i,
  /cast to/i,
  /timed out after/i,
  /traceback \(most recent call last\)/i,
  /referenceerror/i,
  /typeerror/i,
  /stack:/i,
];

function expectSoft(cond: boolean, msg: string) {
  if (!cond) {
    if (SOFT) console.warn('[soft] ' + msg);
    else throw new Error(msg);
  }
}

async function api(): Promise<APIRequestContext> {
  return await pwRequest.newContext({ baseURL: API });
}

// A small set of classic probes (URL context)
const SQLI_PROBES = [
  `' OR '1'='1`,
  `" OR "1"="1`,
  `') OR ('1'='1`,
  `admin'--`,
  `%27%20OR%201=1--`,        // URL-encoded
  `1; DROP TABLE users;--`,
  `') UNION SELECT NULL--`,
];

// NoSQL-shaped probes (often cause server-side cast/parse errors if vulnerable)
const NOSQLI_PROBES = [
  `{"$ne": null}`,
  `{"$gt": ""}`,
  `{"$where": "this.password.length > 0"}`,
  `{"__proto__": {"polluted":"yes"}}`,
  `%7B%22%24ne%22%3Anull%7D`, // URL-encoded {"$ne":null}
];

/**
 * Utility: assert body text doesn’t leak stack traces / DB internals.
 */
function assertNoLeak(bodyText: string, where: string) {
  const hit = ERROR_SIGNATURES.find(rx => rx.test(bodyText));
  expectSoft(!hit, `Response leaked error details on ${where}: matched ${hit}`);
}

/**
 * Endpoint strategy (stable baselines)
 * - We use /api/articles?tag=unlikelyTag to establish a baseline of 0 results.
 * - Then we append probes to the same param and verify:
 *    * status stays 2xx
 *    * articles array remains empty (no “OR 1=1” expansion)
 *    * no error signatures leak in response
 */
test.describe('[security] SQLi / NoSQLi probing', () => {
  test('Query param probes do not change results and do not leak errors', async () => {
    const ctx = await api();

    // Baseline very-unlikely tag → should be 0 results
    const uniqueTag = `unlikely_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const base = await ctx.get(`/api/articles?tag=${encodeURIComponent(uniqueTag)}&limit=5&offset=0`);
    expect(base.ok()).toBeTruthy();
    const baseBodyText = await base.text();
    assertNoLeak(baseBodyText, `baseline /api/articles?tag=${uniqueTag}`);
    let baseJson: any;
    try { baseJson = JSON.parse(baseBodyText); } catch { baseJson = {}; }

    const baseCount = Array.isArray(baseJson?.articles) ? baseJson.articles.length : 0;
    // Baseline should be empty; if not, we still use it for comparison (no expansion allowed)
    console.log(` Baseline count for tag="${uniqueTag}" is ${baseCount}`);

    const allProbes = [...SQLI_PROBES, ...NOSQLI_PROBES];

    for (const probeRaw of allProbes) {
      const probe = String(probeRaw);
      const url = `/api/articles?tag=${encodeURIComponent(uniqueTag + probe)}&limit=5&offset=0`;
      const res = await ctx.get(url);
      const status = res.status();
      const text = await res.text().catch(() => '');
      // We prefer 2xx or a clean 4xx; strong servers should not 5xx here
      expectSoft(status < 500, `Server errored (5xx) for probe "${probe}" on ${url}: status=${status}`);
      assertNoLeak(text, `probe on ${url}`);

      let js: any = {};
      try { js = JSON.parse(text); } catch { /* Some APIs may safely 4xx with text */ }

      const count = Array.isArray(js?.articles) ? js.articles.length : 0;

      // The probe must NOT dramatically increase results vs baseline
      // (We allow same or fewer; if baseline was 0, count should remain 0.)
      expectSoft(
        count <= Math.max(baseCount, 0),
        `Probe expanded results for ${url}. Baseline=${baseCount}, got=${count}, probe="${probe}".`
      );
    }

    await ctx.dispose();
  });

  /**
   * Login endpoint: probes must not succeed; errors must not leak details.
   */
  test('Login body probes are rejected cleanly (no stack traces)', async () => {
    const ctx = await api();

    const bodyProbes: Array<Record<string, any>> = [
      { email: `' OR '1'='1`, password: 'pw' },
      { email: `") OR ("1"="1`, password: 'pw' },
      { email: `user@example.com`, password: `") OR ("1"="1` },
      // NoSQL-y shapes (should be treated as strings or rejected)
      { email: { $ne: null }, password: 'pw' },
      { email: 'user@example.com', password: { $gt: '' } },
      { email: { $where: 'this.password.length > 0' }, password: 'pw' },
    ];

    for (const p of bodyProbes) {
      const res = await ctx.post('/api/users/login', {
        headers: json,
        data: { user: p },
      });
      const status = res.status();
      const text = await res.text().catch(() => '');

      // Must not succeed. Acceptable: 401/403/422/400. Should not 5xx.
      expectSoft(
        [401, 403, 422, 400].includes(status),
        `Login probe returned unexpected status ${status} for payload ${JSON.stringify(p)}`
      );
      expectSoft(status < 500, `Server 5xx on login probe ${JSON.stringify(p)}.`);

      assertNoLeak(text, `login probe ${JSON.stringify(p)}`);
    }

    await ctx.dispose();
  });

  /**
   * Optional: author-based queries also shouldn’t be affected by probes.
   * We use an unlikely author to aim for a stable baseline of 0 results.
   */
  test('Author param probes do not expand results', async () => {
    const ctx = await api();
    const author = `unlikely_author_${Date.now()}`;

    const base = await ctx.get(`/api/articles?author=${encodeURIComponent(author)}&limit=5&offset=0`);
    expect(base.ok()).toBeTruthy();
    const baseText = await base.text();
    assertNoLeak(baseText, `baseline /api/articles?author=${author}`);

    let baseJson: any;
    try { baseJson = JSON.parse(baseText); } catch { baseJson = {}; }
    const baseCount = Array.isArray(baseJson?.articles) ? baseJson.articles.length : 0;

    for (const probe of SQLI_PROBES) {
      const url = `/api/articles?author=${encodeURIComponent(author + probe)}&limit=5&offset=0`;
      const res = await ctx.get(url);
      const text = await res.text().catch(() => '');
      const status = res.status();

      expectSoft(status < 500, `Server 5xx for author probe "${probe}"`);
      assertNoLeak(text, `author probe on ${url}`);

      let js: any = {};
      try { js = JSON.parse(text); } catch {}
      const count = Array.isArray(js?.articles) ? js.articles.length : 0;

      expectSoft(
        count <= Math.max(baseCount, 0),
        `Author probe expanded results for ${url}. Baseline=${baseCount}, got=${count}, probe="${probe}".`
      );
    }

    await ctx.dispose();
  });
});