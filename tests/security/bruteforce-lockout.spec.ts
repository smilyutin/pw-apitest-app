// tests/security/bruteforce-lockout.spec.ts
import { test, expect, request } from '@playwright/test';
import fs from 'fs';

const API = 'https://conduit-api.bondaracademy.com';
const SOFT = process.env.SECURITY_SOFT === '1';                 // soft-warn mode for CI
const MAX_ATTEMPTS = Number(process.env.BF_ATTEMPTS || 10);

const USER = (() => {
  // Reuse your shared creds file
  // .secrets/creds.json -> { "email": "...", "password": "..." }
  const path = '.secrets/creds.json';
  if (!fs.existsSync(path)) {
    throw new Error(`Credentials file not found at ${path}. Please create it with your test user credentials.`);
  }
  const j = JSON.parse(fs.readFileSync(path, 'utf-8'));
  return { email: j.email as string, password: j.password as string };
})();

function expectSoft(condition: boolean, message: string) {
  if (!condition) {
    if (SOFT) console.warn('⚠️ [soft] ' + message);
    else throw new Error(message);
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

test.describe('[security] Brute-force / lockout behavior', () => {
  test('Repeated bad passwords should trigger throttling/lockout or at least consistent failures', async () => {
    const ctx = await request.newContext();

    const statuses: number[] = [];
    const rateHints: Array<Record<string, string>> = [];
    const delays: number[] = [];

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const t0 = Date.now();
      const res = await ctx.post(`${API}/api/users/login`, {
        data: { user: { email: USER.email, password: `wrong-${i}` } },
        headers: { 'Content-Type': 'application/json' },
      });
      const dt = Date.now() - t0;

      statuses.push(res.status());
      delays.push(dt);

      const h = res.headers();
      const rl = Object.fromEntries(
        Object.entries(h).filter(([k]) => /ratelimit|retry-after/i.test(k))
      );
      if (Object.keys(rl).length) rateHints.push(rl);

      // polite short backoff + jitter
      await sleep(200 + Math.floor(Math.random() * 200));
    }

    // 1) None of the attempts should succeed
    expect(
      statuses.every(s => [401, 403, 422, 429].includes(s)),
      `Unexpected status codes: ${statuses.join(', ')}`
    ).toBeTruthy();

    // 2) Preferred: evidence of throttling/lockout
    const saw429 = statuses.includes(429);
    const sawRetryAfter = rateHints.some(h => 'retry-after' in h);
    const sawRateHeaders = rateHints.length > 0;

    // 3) If no throttle signals, accept "consistent hard denial" as OK policy
    const consistentHardDeny = statuses.every(s => [401, 403, 422].includes(s));

    if (!(saw429 || sawRetryAfter || sawRateHeaders)) {
      expectSoft(
        consistentHardDeny,
        `No clear throttle/lockout signals. Statuses: ${statuses.join(', ')}; headers: ${JSON.stringify(rateHints)}`
      );
    }

    // 4) Optional latency heuristic: extremely fast auth may indicate no backoff
    const avgMs = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
    if (avgMs < 50) {
      expectSoft(false, `Auth endpoint responded extremely fast (~${avgMs}ms avg). Consider adding incremental backoff.`);
    }
  });

  test('After many wrong attempts, immediate valid login should succeed OR be temporarily blocked (both acceptable if documented)', async () => {
    const ctx = await request.newContext();

    // A few wrong attempts first
    for (let i = 0; i < Math.min(MAX_ATTEMPTS, 6); i++) {
      await ctx.post(`${API}/api/users/login`, {
        data: { user: { email: USER.email, password: `wrong-${i}` } },
        headers: { 'Content-Type': 'application/json' },
      });
      await sleep(150 + Math.floor(Math.random() * 100));
    }

    // Now a correct attempt — 200/201 OK or 429/403 temporary block are acceptable
    const valid = await ctx.post(`${API}/api/users/login`, {
      data: { user: { email: USER.email, password: USER.password } },
      headers: { 'Content-Type': 'application/json' },
    });

    const acceptable = [200, 201, 429, 403];
    expectSoft(
      acceptable.includes(valid.status()),
      `Valid login after failed attempts returned ${valid.status()}`
    );
  });
});