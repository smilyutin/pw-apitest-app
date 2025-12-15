// CSP minimal strength (no unsafe-inline), presence of default-src, and nonce/hash if strict-dynamic is used
// Clickjacking via X-Frame-Options or frame-ancestors in CSP
// nosniff, Referrer-Policy, Permissions-Policy (not wildcard), and HSTS with sane values

import { test, expect } from '@playwright/test';
import { APP } from '../../fixture/security-urls';

// === CONFIG ===
const SOFT = process.env.SECURITY_SOFT === '1'; // set to "1" to warn instead of fail hard

const expectSoft = (ok: boolean, msg: string) => {
  if (!ok) {
    if (SOFT) console.warn('[soft] ' + msg);
    else throw new Error(msg);
  }
};

// --- Helpers ---
function parseDirectives(value: string) {
  // Parses header directives like: "key=value; flag; other=value"
  const out: Record<string, string | boolean> = {};
  for (const raw of value.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const i = part.indexOf('=');
    if (i === -1) out[part.toLowerCase()] = true;
    else out[part.slice(0, i).toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function parseCsp(csp: string) {
  // Turns a CSP string into a map: { 'default-src': "…", 'script-src': "…", ... }
  const map: Record<string, string> = {};
  for (const seg of csp.split(';')) {
    const s = seg.trim();
    if (!s) continue;
    const sp = s.split(/\s+/);
    const name = sp.shift()?.toLowerCase();
    if (name) map[name] = sp.join(' ');
  }
  return map;
}

test.describe.skip('[security-headers] UI responses', () => {
  test('CSP present and reasonably strict', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res, 'Navigation should succeed').toBeTruthy();

    const headers = res!.headers();
    const csp = headers['content-security-policy'];

    expectSoft(!!csp, 'Missing Content-Security-Policy header.');
    if (!csp) return; // in soft mode, stop here but don’t fail the rest

    const d = parseCsp(csp);

    // default-src should exist
    expectSoft(!!d['default-src'], `CSP missing "default-src": ${csp}`);

    // discourage unsafe-inline for scripts (prefer nonce/hash or strict-dynamic)
    const script = d['script-src'] || '';
    expectSoft(
      !/\'unsafe-inline\'/i.test(script),
      `CSP 'script-src' includes 'unsafe-inline'. Prefer nonces/hashes or 'strict-dynamic'. (${script})`
    );

    // If you use strict-dynamic, ensure 'nonce-' or 'hash' exists too
    if (/strict-dynamic/i.test(script)) {
      expectSoft(
        /'nonce-|sha(256|384|512)-/i.test(script),
        `CSP 'script-src' has 'strict-dynamic' but no nonce/hash present. (${script})`
      );
    }
  });

  test('Clickjacking protection (X-Frame-Options or frame-ancestors)', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res).toBeTruthy();

    const h = res!.headers();
    const xfo = h['x-frame-options']; // e.g., DENY or SAMEORIGIN
    const csp = h['content-security-policy'] || '';
    const hasFrameAncestors = /(^|;) *frame-ancestors/i.test(csp);

    expectSoft(
      !!xfo || hasFrameAncestors,
      'Missing clickjacking defense: provide X-Frame-Options or frame-ancestors in CSP.'
    );

    if (xfo) {
      expectSoft(/^(deny|sameorigin)$/i.test(xfo), `Unexpected X-Frame-Options value: "${xfo}"`);
    }
  });

  test('nosniff present', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res).toBeTruthy();
    const xcto = res!.headers()['x-content-type-options'];
    expectSoft(
      xcto?.toLowerCase() === 'nosniff',
      `Missing/incorrect X-Content-Type-Options: got "${xcto || '∅'}", expected "nosniff".`
    );
  });

  test('Referrer-Policy present (e.g., no-referrer, strict-origin-when-cross-origin)', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res).toBeTruthy();
    const rp = res!.headers()['referrer-policy'];
    expectSoft(
      !!rp,
      'Missing Referrer-Policy header.'
    );

    // Not prescriptive—just flag obviously weak values
    if (rp) {
      expectSoft(
        !/unsafe-url/i.test(rp),
        `Referrer-Policy "${rp}" is weak (avoid "unsafe-url").`
      );
    }
  });

  test('Permissions-Policy present and not overly permissive', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res).toBeTruthy();

    const pp = res!.headers()['permissions-policy'] || res!.headers()['feature-policy']; // legacy
    expectSoft(
      !!pp,
      'Missing Permissions-Policy header (consider restricting powerful APIs).'
    );
    if (!pp) return;

    const d = parseDirectives(pp);
    // Spot check a few powerful APIs — values like "()" or "self" are normal; "*" is overly broad.
    const tooOpen = Object.entries(d).some(([k, v]) => String(v).trim() === '*');
    expectSoft(
      !tooOpen,
      `Permissions-Policy has wildcard "*": ${pp}`
    );
  });

  test('HSTS present and strong (HTTPS)', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'domcontentloaded' });
    expect(res).toBeTruthy();

    const hsts = res!.headers()['strict-transport-security'];
    expectSoft(!!hsts, 'Missing Strict-Transport-Security on HTTPS response.');

    if (!hsts) return;
    const d = parseDirectives(hsts);
    const maxAge = Number(d['max-age']);
    const includeSubs = !!d['includesubdomains'];
    const preload = !!d['preload'];

    // >= 6 months; recommend 1 year (31536000)
    expectSoft(Number.isFinite(maxAge) && maxAge >= 15552000,
      `HSTS max-age too low or missing: "${hsts}" (recommend >= 31536000).`
    );
    expectSoft(includeSubs, `HSTS missing "includeSubDomains": "${hsts}".`);
    if (!preload) {
      console.warn('[soft] HSTS missing "preload" (optional, needed for Chromium preload list).');
    }
  });
});