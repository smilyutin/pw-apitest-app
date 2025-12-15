import { test, expect, request as pwRequest } from '@playwright/test';
import fs from 'fs';
import { parseJwt, withAlgNone, withPayloadMutation, withBrokenSignature } from '../../../utils/jwt-utils';
import { API } from '../../fixture/security-urls';
const AUTH_FILE = '.auth/user.json';

// pull the real token written by your global setup
function readToken(): string {
  const user = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  const token = user?.origins?.[0]?.localStorage?.find((i: any) => i.name === 'jwtToken')?.value;
  if (!token) throw new Error('No jwtToken in .auth/user.json');
  return token;
}

test.describe('[JWT] Integrity & Policy', () => {
  test('server rejects alg=none tokens', async () => {
    const good = readToken();
    const bad = withAlgNone(good);

    const ctx = await pwRequest.newContext();
    const res = await ctx.get(`${API}/api/user`, {
      headers: { Authorization: `Token ${bad}` },
    });

    // Expect auth failure
    expect([401, 403]).toContain(res.status());
  });

  test('server rejects tampered payload (signature mismatch)', async () => {
    const good = readToken();
    // bump exp far into future OR change sub/id
    const now = Math.floor(Date.now() / 1000);
    const bad = withPayloadMutation(good, { exp: now + 60 * 60 * 24 * 365, admin: true });

    const ctx = await pwRequest.newContext();
    const res = await ctx.get(`${API}/api/user`, {
      headers: { Authorization: `Token ${bad}` },
    });

    expect([401, 403]).toContain(res.status());
  });

  test('server rejects broken signature', async () => {
    const good = readToken();
    const bad = withBrokenSignature(good);

    const ctx = await pwRequest.newContext();
    const res = await ctx.get(`${API}/api/user`, {
      headers: { Authorization: `Token ${bad}` },
    });

    expect([401, 403]).toContain(res.status());
  });

  test('client-side sanity: token has exp (future) and nbf (if present) ≤ now', async () => {
    const token = readToken();
    const { payload } = parseJwt(token);
    const now = Math.floor(Date.now() / 1000);

    // exp must exist and be in the future
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBeGreaterThan(now);

    // if nbf present, should be ≤ now (or allow small skew)
    if (typeof payload.nbf === 'number') {
      expect(payload.nbf).toBeLessThanOrEqual(now + 60); // allow ≤ 60s skew
    }

    // Soft warning if the token is expiring very soon (helps flaky runs)
    const minsLeft = Math.round((payload.exp - now) / 60);
    if (minsLeft < 15) {
      const msg = `[SECURITY] JWT expires in ~${minsLeft} min — consider rotating more often for tests`;
      if (process.env.CI) {
        // In CI you might prefer a failure; or keep it as a warning:
        console.warn(msg);
      } else {
        console.warn(msg);
      }
    }
  });
});