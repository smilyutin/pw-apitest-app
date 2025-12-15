// tests/security/abuse/rate-limit.spec.ts
import { test, expect, request as pwRequest } from '@playwright/test';
import { API } from '../../fixture/security-urls';
const SOFT = process.env.SECURITY_SOFT === '1';
const BURST = Number(process.env.RL_BURST || 25);       // how many requests in the burst
const CONCURRENCY = Number(process.env.RL_CONC || 10);  // concurrent workers

const expectSoft = (cond: boolean, msg: string) => {
  if (!cond) {
    if (SOFT) console.warn('[soft] ' + msg);
    else throw new Error(msg);
  }
};

test.describe('[security] Rate limiting & abuse controls', () => {
  test('Burst of login attempts yields 429 / Retry-After or RateLimit-* headers', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API });

    // We’ll spam invalid logins (safe: no real account changes).
    const tasks = Array.from({ length: BURST }, (_, i) => i);
    const statuses: number[] = [];
    const hints: Array<Record<string,string>> = [];

    // simple pool
    async function worker(id: number) {
      while (tasks.length) {
        tasks.pop();
        const res = await ctx.post('/api/users/login', {
          headers: { 'Content-Type': 'application/json' },
          data: { user: { email: `nope_${Date.now()}_${id}@example.com`, password: 'wrong' } },
        });
        statuses.push(res.status());
        const h = res.headers();
        const rl = Object.fromEntries(
          Object.entries(h).filter(([k]) => /ratelimit|retry-after/i.test(k))
        );
        if (Object.keys(rl).length) hints.push(rl);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

    // 1) We expect evidence of throttling:
    const saw429 = statuses.includes(429);
    const sawRetry = hints.some(h => 'retry-after' in h);
    const sawRate = hints.length > 0;

    expectSoft(
      saw429 || sawRetry || sawRate,
      `No clear rate-limit signals. statuses=${JSON.stringify(statuses)} hints=${JSON.stringify(hints)}`
    );

    // 2) Even without 429, failures should be consistent (no 2xx here)
    expectSoft(
      statuses.every(s => s >= 400 && s < 500 || s === 429),
      `Unexpected non-error statuses in burst: ${JSON.stringify(statuses)}`
    );

    await ctx.dispose();
  });
});