// tests/security/abuse/payload-size.spec.ts
import { test, expect, request as pwRequest } from '@playwright/test';
import { accessToken } from '../../../utils/token';

const API = 'https://conduit-api.bondaracademy.com';
const SOFT = process.env.SECURITY_SOFT === '1';
const BIG_MB = Number(process.env.BIG_MB || 5);  // ~5MB JSON field by default

const expectSoft = (cond: boolean, msg: string) => {
  if (!cond) {
    if (SOFT) console.warn(' [soft] ' + msg);
    else throw new Error(msg);
  }
};

function bigString(mb: number) {
  const size = mb * 1024 * 1024;
  return 'X'.repeat(Math.max(1, size));
}

test.describe('[security] Large payload / body-size protections', () => {
  test('Very large article body is rejected with 413 or safe 4xx', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API });
    const huge = bigString(BIG_MB);

    const res = await ctx.post('/api/articles', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${accessToken}`,
      },
      data: {
        article: {
          title: `huge-${Date.now()}`,
          description: 'oversize body test',
          body: huge,
          tagList: [],
        },
      },
      // Optional: cap the request-time to avoid tying up runner forever
      timeout: 30_000,
    });

    const s = res.status();
    // Ideal: 413 Payload Too Large
    // Acceptable fallback: 400/422 safe rejection (still prevents abuse)
    expectSoft(
      [413, 400, 422].includes(s),
      `Large payload not rejected safely; got status=${s}`
    );

    // Should not be 5xx (crash / unhandled)
    expectSoft(
      s < 500,
      `Server threw 5xx on large payload (DoS risk): ${s}`
    );

    await ctx.dispose();
  });
});