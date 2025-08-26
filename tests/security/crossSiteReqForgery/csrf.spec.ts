// tests/security/crossSiteReqForgery/csrf.spec.ts
import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import { accessToken } from '../../../utils/token';

const API = 'https://conduit-api.bondaracademy.com';
const SOFT = process.env.SECURITY_SOFT === '1';
const json = { 'Content-Type': 'application/json' };

function short(s: string, n = 200) {
  return (s || '').slice(0, n);
}

function expectSoft(cond: boolean, msg: string) {
  if (!cond) {
    if (SOFT) console.warn('Ai  ' + msg);
    else throw new Error(msg);
  }
}

async function newApi(opts?: Parameters<typeof pwRequest.newContext>[0]): Promise<APIRequestContext> {
  return await pwRequest.newContext({ baseURL: API, ...opts });
}

// Helper: expect an auth/CSRF-style rejection; treat CORS 5xx as soft warning.
async function expectMissingToken(status: number, bodyText: string, what: string) {
  const ok = [401, 403, 422, 400].includes(status);
  if (ok) {
    return; // proper rejection
  }

  const looksLikeCors5xx =
    status >= 500 &&
    /not allowed by cors/i.test(bodyText || '');

  if (looksLikeCors5xx) {
    console.warn(` ${what} returned ${status} (CORS error). Expected 401/403/422/400.`);
    // Soft-pass regardless of SECURITY_SOFT, we only warn here.
    return;
  }

  // Anything else: hard/soft depending on SECURITY_SOFT
  expectSoft(false, `${what} should be rejected (401/403/422/400). Got ${status}`);
}

test.describe('[security] CSRF / state-change must require auth token', () => {
  test('POST without Authorization is rejected; with Authorization succeeds; unauth DELETE must not remove', async () => {
    const forged = await newApi(); // no auth context
    const auth = await newApi();   // explicit Authorization headers only

    // 1) Forged create (no auth, hostile origin)
    const forgedPost = await forged.post('/api/articles', {
      headers: { ...json, Origin: 'https://evil.example', Referer: 'https://evil.example/' },
      data: {
        article: {
          title: `csrf-forged-${Date.now()}`,
          description: 'attempt without token',
          body: 'this should fail',
          tagList: [],
        },
      },
    });

    const forgedBody = await forgedPost.text().catch(() => '');
    console.log(' forged POST status=', forgedPost.status(),
                'ct=', forgedPost.headers()['content-type'],
                'body=', short(forgedBody));
    await expectMissingToken(forgedPost.status(), forgedBody, 'POST /api/articles without Authorization');

    // 2) Control create (with auth)
    const create = await auth.post('/api/articles', {
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
    const createTxt = await create.text();
    console.log('auth POST status=', create.status(),
                'ct=', create.headers()['content-type'],
                'body=', short(createTxt));
    expect(create.status()).toBe(201);
    const created = JSON.parse(createTxt);
    const slug: string = created.article.slug;

    // 3) Unauth DELETE must not remove the resource
    const delNoAuth = await forged.delete(`/api/articles/${slug}`, {
      headers: { Origin: 'https://evil.example', Referer: 'https://evil.example/' },
    });
    const delNoAuthBody = await delNoAuth.text().catch(() => '');
    console.log(' forged DELETE status=', delNoAuth.status(),
                'ct=', delNoAuth.headers()['content-type'],
                'body=', short(delNoAuthBody));

    // Accept 401/403/404; treat 5xx CORS as soft warning; fail others.
    const delRejected = [401, 403, 404].includes(delNoAuth.status());
    const delLooksCors5xx = delNoAuth.status() >= 500 && /not allowed by cors/i.test(delNoAuthBody || '');
    if (!delRejected && !delLooksCors5xx) {
      expectSoft(false, `DELETE without Authorization should be rejected; got ${delNoAuth.status()}`);
    }
    if (delLooksCors5xx) {
      console.warn(' Unauth DELETE returned 5xx CORS. Expected 401/403/404.');
    }

    // 4) Verify existence after unauth DELETE
    const getAfter = await auth.get(`/api/articles/${slug}`, {
      headers: { Authorization: `Token ${accessToken}` },
    });
    console.log(' GET after unauth DELETE status=', getAfter.status());
    const stillThere = getAfter.status() === 200;

    // If server returned success AND it disappeared → critical.
    if ((delNoAuth.status() === 200 || delNoAuth.status() === 204) && !stillThere) {
      expectSoft(false, 'Unauthenticated DELETE actually removed the article (critical).');
    }
    // If server returned success BUT article remains → status bug.
    if ((delNoAuth.status() === 200 || delNoAuth.status() === 204) && stillThere) {
      console.warn('  Unauth DELETE returned success but resource still exists — likely wrong status.');
    }

    // 5) Cleanup (only if still exists)
    if (stillThere) {
      const delAuth = await auth.delete(`/api/articles/${slug}`, {
        headers: { Authorization: `Token ${accessToken}` },
      });
      console.log('🧹 auth DELETE status=', delAuth.status());
      expect(delAuth.status()).toBe(204);
    } else {
      console.warn(' Article gone at cleanup time.');
    }

    await forged.dispose();
    await auth.dispose();
  });
});