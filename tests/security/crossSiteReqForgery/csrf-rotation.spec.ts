// tests/security/csrf/csrf-rotation.spec.ts
//Token bound to session (rotates, not reused across users).
import { test, expect, request as pwRequest } from '@playwright/test';

const API = 'https://conduit-api.bondaracademy.com';
const json = { 'Content-Type': 'application/json' };

// Global soft mode (used for non-rotation soft checks if you want later)
const SOFT = process.env.SECURITY_SOFT === '1';

// Rotation strictness: by default we only WARN if token doesn't rotate
// Set CSRF_ROTATION_STRICT=1 to fail when re-login returns the same token.
const ROTATION_STRICT = process.env.CSRF_ROTATION_STRICT === '1';

const rotationCheck = (cond: boolean, msg: string) => {
  if (cond) return;
  if (ROTATION_STRICT) throw new Error(msg);
  console.warn(' [rotation-soft] ' + msg);
};

async function newApi() {
  return await pwRequest.newContext({ baseURL: API });
}

async function register(ctx: any, email: string, password: string, username: string) {
  console.log(`Registering ${email}`);
  const res = await ctx.post('/api/users', {
    headers: json,
    data: { user: { email, password, username } },
  });
  const status = res.status();
  const ct = res.headers()['content-type'] || '';
  const bodyText = await res.text().catch(() => '');
  console.log(`status=${status} ct=${ct}`);
  if (!/application\/json/i.test(ct)) {
    // Some backends return text/HTML on 422 (already exists) — don’t hard fail.
    console.warn(` Non-JSON register response (status ${status}): ${bodyText.slice(0, 200)}`);
  }
  // 201 = created, 422 = already exists
  expect([201, 422]).toContain(status);
  try { return await res.json(); } catch { return {}; }
}

async function login(ctx: any, email: string, password: string) {
  console.log(` Logging in ${email}`);
  const res = await ctx.post('/api/users/login', {
    headers: json,
    data: { user: { email, password } },
  });
  const status = res.status();
  const bodyText = await res.text().catch(() => '');
  console.log(`status=${status}`);
  expect(status).toBe(200);
  try { return JSON.parse(bodyText); } catch {
    throw new Error(`Expected JSON from login; got: ${bodyText.slice(0, 300)}`);
  }
}

test.describe('[security] CSRF token binding & rotation', () => {
  test('Token is unique per user and rotates on re-login (soft if backend is stateless JWT)', async () => {
    const ctx = await newApi();
    const ts = Date.now();

    // Create two ephemeral users
    const pass = 'Passw0rd!x';
    const aEmail = `userA_${ts}@example.com`;
    const bEmail = `userB_${ts}@example.com`;
    await register(ctx, aEmail, pass, `userA_${ts}`);
    await register(ctx, bEmail, pass, `userB_${ts}`);

    // User A login #1
    const a1 = await login(ctx, aEmail, pass);
    const tokenA1: string | undefined = a1?.user?.token;
    console.log(' A1 token:', tokenA1?.slice(0, 18));
    expect(tokenA1, 'A1 token missing').toBeTruthy();

    // Simulate “rotation”: login again
    const a2 = await login(ctx, aEmail, pass);
    const tokenA2: string | undefined = a2?.user?.token;
    console.log(' A2 token:', tokenA2?.slice(0, 18));
    expect(tokenA2, 'A2 token missing').toBeTruthy();

    // Rotation check (soft for JWT apps that may reissue identical tokens)
    rotationCheck(
      tokenA1! !== tokenA2!,
      'Token did not rotate on re-login (common for stateless JWT, but stronger CSRF defenses rotate).'
    );

    // User B login
    const b = await login(ctx, bEmail, pass);
    const tokenB: string | undefined = b?.user?.token;
    console.log(' B token:', tokenB?.slice(0, 18));
    expect(tokenB, 'B token missing').toBeTruthy();

    // Binding: tokens for different users should differ (STRICT)
    expect(tokenA2).not.toBe(tokenB);

    // Replay sanity: using A’s token must resolve to A (STRICT)
    const replay = await ctx.get('/api/user', {
      headers: { Authorization: `Token ${tokenA2}` },
    });
    expect(replay.status()).toBe(200);
    const replayJson = await replay.json().catch(() => ({}));
    const emailFromReplay = replayJson?.user?.email;
    console.log(' /api/user with A token returned user:', emailFromReplay);
    expect(emailFromReplay).toBe(aEmail);

    await ctx.dispose();
  });
});