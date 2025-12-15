// tests/security/cors/cors.spec.ts

// CORS test suite that adds the two checks you asked for:
// 	No multiple-origins in Access-Control-Allow-Origin (i.e., no comma-separated list).
// 	Preflight status sanity: allowed origins should return 200/204; disallowed origins should omit ACAO/ACAC (status may still be 200).

import { test, expect, request as pwRequest } from '@playwright/test';
import { API, GOOD_ORIGIN, BAD_ORIGIN } from '../../fixture/security-urls';

// Soft mode: let PRs warn without failing (CI main should be strict)
const SOFT = process.env.SECURITY_SOFT === '1';
const expectSoft = (cond: boolean, msg: string) => {
  if (!cond) {
    if (SOFT) console.warn(' [soft] ' + msg);
    else throw new Error(msg);
  }
};

const is2xxNoContent = (s: number) => s === 204 || s === 200;

test.describe('[security] CORS checks', () => {
  test('Preflight from disallowed origin must fail (no ACAO/ACAC)', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API });

    const preflight = await ctx.fetch('/api/articles', {
      method: 'OPTIONS',
      headers: {
        Origin: BAD_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
    });

    const s = preflight.status();
    const h = preflight.headers();
    const allowOrigin = h['access-control-allow-origin'];
    const allowCreds = h['access-control-allow-credentials'];

    // Some servers return 200 for preflight but omit ACAO/ACAC to deny
    expectSoft(
      !allowOrigin,
      `CORS misconfig: disallowed origin was accepted → ACAO="${allowOrigin}".`
    );
    expectSoft(
      !allowCreds || allowCreds.toLowerCase() !== 'true',
      `CORS misconfig: ACAC=true for disallowed origin.`
    );

    // If server tries to signal denial via status code, make sure it's not 2xx + ACAO
    if (!SOFT) {
      if (allowOrigin) expect(is2xxNoContent(s)).toBeFalsy();
    }

    await ctx.dispose();
  });

  test('Preflight from allowed origin succeeds; credentials policy is safe', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API });

    const preflight = await ctx.fetch('/api/articles', {
      method: 'OPTIONS',
      headers: {
        Origin: GOOD_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
    });

    const s = preflight.status();
    const h = preflight.headers();
    const allowOrigin = h['access-control-allow-origin'];
    const allowCreds = h['access-control-allow-credentials'];
    const allowMethods = (h['access-control-allow-methods'] || '').toUpperCase();
    const allowHeaders = (h['access-control-allow-headers'] || '').toLowerCase();
    const vary = (h['vary'] || '').toLowerCase();

    // Status sanity for allowed origin
    expectSoft(
      is2xxNoContent(s),
      `Allowed preflight should be 200/204; got ${s}.`
    );

    // Allowed origin should be echoed exactly
    expect(allowOrigin).toBe(GOOD_ORIGIN);

    // No multiple origins (comma) ever
    expectSoft(
      !/,/.test(allowOrigin || ''),
      `ACAO must not list multiple origins: "${allowOrigin}".`
    );

    // If credentials are supported, must not use wildcard origin AND should Vary by Origin
    if ((allowCreds || '').toLowerCase() === 'true') {
      expect(allowOrigin).not.toBe('*');
      expectSoft(
        vary.includes('origin'),
        'When echoing Origin dynamically, add "Vary: Origin".'
      );
    }

    // Sanity on methods/headers
    expectSoft(
      allowMethods.includes('POST'),
      `ACAM should include POST; got "${allowMethods || '(missing)'}".`
    );
    expectSoft(
      ['content-type', 'authorization'].every(hh => allowHeaders.includes(hh)),
      `ACAH should include content-type, authorization; got "${allowHeaders || '(missing)'}".`
    );

    await ctx.dispose();
  });

  test('Credentials are never allowed with wildcard origin (*)', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API });

    const targets = ['/api/articles', '/api/user', '/api/profiles/test'];
    for (const path of targets) {
      const preflight = await ctx.fetch(path, {
        method: 'OPTIONS',
        headers: {
          Origin: GOOD_ORIGIN,
          'Access-Control-Request-Method': 'GET',
        },
      });
      const h = preflight.headers();
      const allowOrigin = h['access-control-allow-origin'];
      const allowCreds = h['access-control-allow-credentials'];

      // If ACAC=true on any path, ACAO must not be *
      if ((allowCreds || '').toLowerCase() === 'true') {
        expectSoft(
          allowOrigin !== '*',
          `CORS misconfig on ${path}: ACAC=true but ACAO="*".`
        );
      }

      // Also ensure no multiple-origins list
      expectSoft(
        !/,/.test(allowOrigin || ''),
        `ACAO must not list multiple origins on ${path}: "${allowOrigin}".`
      );
    }

    await ctx.dispose();
  });

  test('Actual request from disallowed origin should not grant credentials', async () => {
    const ctx = await pwRequest.newContext({ baseURL: API });

    const resp = await ctx.get('/api/user', {
      headers: { Origin: BAD_ORIGIN },
    });

    const h = resp.headers();
    const allowOrigin = h['access-control-allow-origin'];
    const allowCreds = h['access-control-allow-credentials'];

    expectSoft(
      !allowOrigin,
      `Actual cross-origin GET exposed ACAO="${allowOrigin}" to a disallowed origin.`
    );
    expectSoft(
      !allowCreds || allowCreds.toLowerCase() !== 'true',
      'Actual cross-origin GET exposed ACAC=true to a disallowed origin.'
    );

    await ctx.dispose();
  });
});