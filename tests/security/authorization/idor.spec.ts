// tests/security/authorization/idor.spec.ts
import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import { API } from '../../fixture/security-urls';
const jsonHeaders = { 'Content-Type': 'application/json' };

async function newApi(): Promise<APIRequestContext> {
  return await pwRequest.newContext({ baseURL: API });
}

// Fail-fast JSON reader with better error reporting
import type { APIResponse } from '@playwright/test';

async function mustJson(res: APIResponse, context = 'response'): Promise<any> {
  const ct = res.headers()['content-type'] || '';
  if (!/application\/json/i.test(ct)) {
    const preview = await res.text().catch(() => '');
    throw new Error(
      `Expected JSON for ${context}, got "${ct}" with status ${res.status()}.\n` +
      `Body preview:\n${preview.slice(0, 500)}`
    );
  }
  return await res.json();
}

async function reg(ctx: APIRequestContext, email: string, password: string, username: string) {
  console.log(`🔹 Registering user: ${email}`);
  const res = await ctx.post('/api/users', {
    headers: jsonHeaders,
    data: { user: { email, password, username } },
  });
  console.log(`   ↳ status ${res.status()}`);
  expect([200, 201, 422]).toContain(res.status());
  return await mustJson(res, `register(${email})`);
}

async function login(ctx: APIRequestContext, email: string, password: string) {
  console.log(`🔹 Logging in: ${email}`);
  const res = await ctx.post('/api/users/login', {
    headers: jsonHeaders,
    data: { user: { email, password } },
  });
  console.log(`   ↳ status ${res.status()}`);
  if (![200, 201].includes(res.status())) {
    const body = await res.text().catch(() => '');
    throw new Error(`Login failed for ${email}: ${res.status()} ${res.statusText()}\n${body}`);
  }
  return await mustJson(res, `login(${email})`);
}

test.describe('[security] IDOR protection', () => {
  test('User B must not update/delete User A’s article', async () => {
    const ctx = await newApi();

    // --- 1) Create two distinct users
    const ts = Date.now();
    const userAEmail = `userA_${ts}@test.com`;
    const userBEmail = `userB_${ts}@test.com`;
    const pass = 'Passw0rd!x';

    await reg(ctx, userAEmail, pass, `userA_${ts}`);
    await reg(ctx, userBEmail, pass, `userB_${ts}`);

    const { user: a } = await login(ctx, userAEmail, pass);
    const { user: b } = await login(ctx, userBEmail, pass);
    console.log(`✅ Tokens acquired: A=${a.token.slice(0, 10)}…, B=${b.token.slice(0, 10)}…`);

    const authA = { Authorization: `Token ${a.token}` };
    const authB = { Authorization: `Token ${b.token}` };

    let slug: string | undefined;

    try {
      // --- 2) User A creates a resource (article)
      console.log('🔹 User A creating article');
      const create = await ctx.post('/api/articles', {
        headers: { ...jsonHeaders, ...authA },
        data: {
          article: {
            title: `Secret A ${ts}`,
            description: 'idor test',
            body: 'private body',
            tagList: [],
          },
        },
      });
      console.log(`   ↳ status ${create.status()}`);
      expect(create.status()).toBe(201);

      const created = await mustJson(create, 'createArticle(A)');
      slug = created.article.slug as string;
      console.log(` Article created: slug=${slug}`);

      // --- 3) GET is public (should succeed without being owner)
      console.log(' User B GET article');
      const getAsB = await ctx.get(`/api/articles/${slug}`, { headers: authB });
      console.log(`   ↳ status ${getAsB.status()}`);
      expect(getAsB.status(), 'GET is public; should not require ownership').toBe(200);

      // --- 4) UPDATE must be forbidden for non-owner
      console.log(' User B attempting PUT (update)');
      const putAsB = await ctx.put(`/api/articles/${slug}`, {
        headers: { ...jsonHeaders, ...authB },
        data: { article: { title: 'Hacked by B' } },
      });
      console.log(`   ↳ status ${putAsB.status()}`);
      if (![401, 403, 404].includes(putAsB.status())) {
        const body = await putAsB.text().catch(() => '');
        throw new Error(`Expected 401/403/404 on PUT by B, got ${putAsB.status()}.\n${body}`);
      }

      // --- 5) DELETE must be forbidden for non-owner
      console.log('🔹 User B attempting DELETE');
      const delAsB = await ctx.delete(`/api/articles/${slug}`, { headers: authB });
      console.log(`   ↳ status ${delAsB.status()}`);
      if (![401, 403, 404].includes(delAsB.status())) {
        const body = await delAsB.text().catch(() => '');
        throw new Error(`Expected 401/403/404 on DELETE by B, got ${delAsB.status()}.\n${body}`);
      }

      // --- 6) Owner can update/delete
      console.log(' User A updating own article');
      const putAsA = await ctx.put(`/api/articles/${slug}`, {
        headers: { ...jsonHeaders, ...authA },
        data: { article: { description: 'owner updated' } },
      });
      console.log(`   ↳ status ${putAsA.status()}`);
      expect(putAsA.status()).toBe(200);

      console.log(' User A deleting own article');
      const delAsA = await ctx.delete(`/api/articles/${slug}`, { headers: authA });
      console.log(`   ↳ status ${delAsA.status()}`);
      expect(delAsA.status()).toBe(204);
    } finally {
      // Best-effort cleanup if the article still exists
      if (slug) {
        console.log(' Cleanup: delete article as User A (best-effort)');
        await ctx.delete(`/api/articles/${slug}`, { headers: authA }).catch(() => {});
      }
      await ctx.dispose();
    }
  });
});