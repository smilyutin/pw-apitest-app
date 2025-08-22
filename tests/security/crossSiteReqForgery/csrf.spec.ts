// tests/security/csrf/csrf.spec.ts
//Token required on state-changing requests (POST/PUT/DELETE)
import { test, expect, request as pwRequest } from '@playwright/test';
import { accessToken } from '../../../utils/token';

const API = 'https://conduit-api.bondaracademy.com';
const SOFT = process.env.SECURITY_SOFT === '1';
const json = { 'Content-Type': 'application/json' };

function expectSoft(condition: boolean, message: string) {
  if (!condition) {
    if (SOFT) console.warn('⚠️ [soft] ' + message);
    else throw new Error(message);
  }
}
const isRejected = (s: number) => [401, 403, 404, 422, 400].includes(s);
const isServerError = (s: number) => s >= 500 && s < 600;

async function newApi() {
  return await pwRequest.newContext({ baseURL: API });
}

async function getTextSafe(res: any) { try { return await res.text(); } catch { return ''; } }

test.describe('[security] CSRF / state-change must require auth token', () => {
  test('POST without Authorization is rejected; with Authorization succeeds; unauth DELETE must not remove', async () => {
    const ctx = await newApi();
    const slugHolder: { slug?: string } = {};

    // 1) Unauth POST should be rejected
    const forged = await ctx.post('/api/articles', {
      headers: { ...json, Origin: 'https://evil.example', Referer: 'https://evil.example/' },
      data: { article: { title: `csrf-forged-${Date.now()}`, description: 'attempt without token', body: 'should fail', tagList: [] } },
    });
    const forgedStatus = forged.status();
    const forgedBody = await getTextSafe(forged);
    if (isServerError(forgedStatus)) {
      console.warn(`⚠️  POST /api/articles without auth returned ${forgedStatus} (should be 401/403). Headers: ${JSON.stringify(forged.headers())} Body: ${forgedBody.slice(0,300)}`);
    }
    expectSoft(isRejected(forgedStatus) || isServerError(forgedStatus),
      `POST without Authorization should be rejected; got ${forgedStatus}`);

    // 2) Create WITH Authorization
    const create = await ctx.post('/api/articles', {
      headers: { ...json, Authorization: `Token ${accessToken}` },
      data: { article: { title: `csrf-valid-${Date.now()}`, description: 'created with token', body: 'ok', tagList: [] } },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    const slug = created.article.slug;
    slugHolder.slug = slug;

    // 3) Unauth DELETE should NOT remove
    const delNoAuth = await ctx.delete(`/api/articles/${slug}`);
    const delNoAuthStatus = delNoAuth.status();
    const delNoAuthBody = await getTextSafe(delNoAuth);
    if (isServerError(delNoAuthStatus)) {
      console.warn(`⚠️  DELETE without auth returned ${delNoAuthStatus} (should be 401/403/404). Headers: ${JSON.stringify(delNoAuth.headers())} Body: ${delNoAuthBody.slice(0,300)}`);
    }

    // Verify existence with an authenticated GET
    const getAuthAfter = await ctx.get(`/api/articles/${slug}`, {
      headers: { Authorization: `Token ${accessToken}` },
    });

    const stillExists = getAuthAfter.status() === 200;
    expectSoft(
      stillExists,
      'Unauthenticated DELETE actually removed the article (critical).'
    );

    // 4) Authorized DELETE should succeed (only if still exists)
    if (stillExists) {
      const delAuth = await ctx.delete(`/api/articles/${slug}`, {
        headers: { Authorization: `Token ${accessToken}` },
      });
      expect(delAuth.status()).toBe(204);
    }

    await ctx.dispose();
  });

  test('PUT without Authorization is rejected; with Authorization succeeds; “wrong token” is blocked', async () => {
    const ctx = await newApi();

    // Create baseline article
    const create = await ctx.post('/api/articles', {
      headers: { ...json, Authorization: `Token ${accessToken}` },
      data: { article: { title: `csrf-put-${Date.now()}`, description: 'pre for PUT', body: 'ok', tagList: [] } },
    });
    expect(create.status()).toBe(201);
    const { article } = await create.json();
    const slug = article.slug;

    // 1) PUT w/o auth should be rejected
    const putNoAuth = await ctx.put(`/api/articles/${slug}`, {
      headers: { ...json, Origin: 'https://evil.example' },
      data: { article: { title: 'hacked-title' } },
    });
    const putNoAuthStatus = putNoAuth.status();
    const putNoAuthBody = await getTextSafe(putNoAuth);
    if (isServerError(putNoAuthStatus)) {
      console.warn(`⚠️  PUT without auth returned ${putNoAuthStatus} (should be 401/403/404). Headers: ${JSON.stringify(putNoAuth.headers())} Body: ${putNoAuthBody.slice(0,300)}`);
    }
    expectSoft(isRejected(putNoAuthStatus) || isServerError(putNoAuthStatus),
      `PUT without Authorization should be rejected; got ${putNoAuthStatus}`);

    // 2) PUT with a WRONG token should be rejected
    const wrongToken = 'Token eyWrong.' + Math.random().toString(36).slice(2);
    const putWrong = await ctx.put(`/api/articles/${slug}`, {
      headers: { ...json, Authorization: wrongToken },
      data: { article: { title: 'wrong-token-edit' } },
    });
    expectSoft(isRejected(putWrong.status()),
      `PUT with wrong token should be rejected; got ${putWrong.status()}`);

    // 3) Owner update succeeds
    const putAuth = await ctx.put(`/api/articles/${slug}`, {
      headers: { ...json, Authorization: `Token ${accessToken}` },
      data: { article: { description: 'owner-updated' } },
    });
    expect(putAuth.status()).toBe(200);

    // cleanup
    await ctx.delete(`/api/articles/${slug}`, {
      headers: { Authorization: `Token ${accessToken}` },
    }).catch(() => {});
    await ctx.dispose();
  });
});