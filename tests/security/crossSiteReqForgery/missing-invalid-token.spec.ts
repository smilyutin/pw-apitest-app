// Missing/invalid token → 403.

import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import { accessToken } from '../../../utils/token';

const API = 'https://conduit-api.bondaracademy.com';
const json = { 'Content-Type': 'application/json' };

// Require 403 only when explicitly asked (policy-ready backends)
const REQUIRE_403 = process.env.CSRF_REQUIRE_403 === '1';
// Optionally treat 5xx as “reject” (e.g., CORS middle-tier says 500 "Not allowed by CORS")
const ALLOW_500 = process.env.CSRF_ALLOW_500 === '1';

function isRejected(status: number, bodyText?: string) {
  if ([401, 403, 422, 400].includes(status)) return true;
  if (ALLOW_500 && status >= 500 && status < 600) return true;
  // Recognize common CORS error body even if ALLOW_500 is not set
  if (status >= 500 && status < 600 && /\bnot allowed by cors\b/i.test(bodyText ?? '')) return true;
  return false;
}

function expectMissingToken(status: number, what: string, bodyText?: string) {
  if (REQUIRE_403) {
    expect(status, `${what} should return 403`).toBe(403);
    return;
  }
  const ok = isRejected(status, bodyText);
  if (!ok) {
    console.warn(`  ${what} returned ${status}. Expected rejection (401/403/422/400${ALLOW_500 ? '/5xx' : ''}).`);
  }
  expect(ok, `${what} should be rejected (401/403/422/400${ALLOW_500 ? '/5xx' : ''}). Got ${status}`).toBeTruthy();
}

async function newApi(): Promise<APIRequestContext> {
  return await pwRequest.newContext({ baseURL: API, extraHTTPHeaders: {} });
}

test.describe('[security] CSRF / Missing or invalid token → 403 (or reject)', () => {
  test('POST/PUT/DELETE: missing vs invalid Authorization', async () => {
    const ctx = await newApi();

    const forgedHeaders: Record<string, string> = {
      ...json,
      Origin: 'https://evil.example',
      Referer: 'https://evil.example/',
    };

    // ── 1) POST without Authorization
    const forgedCreate = await ctx.post('/api/articles', {
      headers: forgedHeaders,
      data: {
        article: {
          title: `csrf-missing-${Date.now()}`,
          description: 'create without token',
          body: 'should fail',
          tagList: [],
        },
      },
    });
    const forgedCt = forgedCreate.headers()['content-type'] || '';
    const forgedBody = await forgedCreate.text().catch(() => '');
    console.log(' forged POST status=', forgedCreate.status(), 'ct=', forgedCt, 'body=', forgedBody.slice(0, 200));
    expectMissingToken(forgedCreate.status(), 'POST /api/articles without Authorization', forgedBody);

    // ── 2) Authorized create (control)
    const created = await ctx.post('/api/articles', {
      headers: { ...json, Authorization: `Token ${accessToken}` },
      data: {
        article: {
          title: `csrf-valid-${Date.now()}`,
          description: 'created with token',
          body: 'ok',
          tagList: [],
        },
      },
    });
    expect(created.status(), 'Authorized create should succeed').toBe(201);
    const createdJson = await created.json();
    const slug: string = createdJson.article.slug;

    // ── 3) PUT without Authorization
    const putNoAuth = await ctx.put(`/api/articles/${slug}`, {
      headers: { ...json, Origin: 'https://evil.example' },
      data: { article: { title: 'hacked-title' } },
    });
    const putNoAuthBody = await putNoAuth.text().catch(() => '');
    console.log(' forged PUT status=', putNoAuth.status(), 'body=', putNoAuthBody.slice(0, 200));
    expectMissingToken(putNoAuth.status(), `PUT /api/articles/${slug} without Authorization`, putNoAuthBody);

    // ── 4) DELETE without Authorization
    const delNoAuth = await ctx.delete(`/api/articles/${slug}`);
    const delNoAuthBody = await delNoAuth.text().catch(() => '');
    console.log(' forged DELETE status=', delNoAuth.status(), 'body=', delNoAuthBody.slice(0, 200));
    expectMissingToken(delNoAuth.status(), `DELETE /api/articles/${slug} without Authorization`, delNoAuthBody);

    // ── 5) Invalid token also rejected
    const putInvalid = await ctx.put(`/api/articles/${slug}`, {
      headers: { ...json, Authorization: 'Token totally.invalid.token' },
      data: { article: { description: 'invalid token attempt' } },
    });
    const putInvalidBody = await putInvalid.text().catch(() => '');
    console.log(' invalid-token PUT status=', putInvalid.status(), 'body=', putInvalidBody.slice(0, 200));
    expectMissingToken(putInvalid.status(), `PUT /api/articles/${slug} with invalid token`, putInvalidBody);

    // ── Cleanup legit article
    const delAuth = await ctx.delete(`/api/articles/${slug}`, {
      headers: { Authorization: `Token ${accessToken}` },
    });
    console.log(' cleanup authorized DELETE status=', delAuth.status());
    expect(delAuth.status(), 'Authorized DELETE should succeed').toBe(204);

    await ctx.dispose();
  });

  test('GET /api/user with missing/invalid token is rejected', async () => {
    const ctx = await newApi();

    const meNoAuth = await ctx.get('/api/user');
    const bodyNoAuth = await meNoAuth.text().catch(() => '');
    console.log(' GET /api/user no-auth status=', meNoAuth.status(), 'body=', bodyNoAuth.slice(0, 200));
    expectMissingToken(meNoAuth.status(), 'GET /api/user without Authorization', bodyNoAuth);

    const meBad = await ctx.get('/api/user', { headers: { Authorization: 'Token totally.invalid.token' } });
    const bodyBad = await meBad.text().catch(() => '');
    console.log(' GET /api/user invalid-token status=', meBad.status(), 'body=', bodyBad.slice(0, 200));
    expectMissingToken(meBad.status(), 'GET /api/user with invalid token', bodyBad);

    const meGood = await ctx.get('/api/user', { headers: { Authorization: `Token ${accessToken}` } });
    console.log(' GET /api/user with valid token status=', meGood.status());
    expect(meGood.status(), 'GET /api/user with valid token').toBe(200);

    await ctx.dispose();
  });
});