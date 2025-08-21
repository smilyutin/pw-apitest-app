// tests/auth.setup.ts
import { test as setup, expect, request, APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getCreds } from '../utils/creds';

const API = 'https://conduit-api.bondaracademy.com';
const AUTH_FILE = path.join(process.cwd(), '.auth', 'user.json');

function ensureAuthFileSkeleton() {
  if (!fs.existsSync(path.dirname(AUTH_FILE))) fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  if (!fs.existsSync(AUTH_FILE)) {
    fs.writeFileSync(
      AUTH_FILE,
      JSON.stringify(
        {
          origins: [
            {
              origin: 'https://conduit.bondaracademy.com',
              localStorage: [{ name: 'jwtToken', value: '' }],
            },
          ],
        },
        null,
        2
      )
    );
  }
}

async function newApi(): Promise<APIRequestContext> {
  // IMPORTANT: isolate from global headers/storage
  return await request.newContext({
    baseURL: API,
    extraHTTPHeaders: {}, // prevent Authorization bleed
  });
}

async function bodyPreview(res: any, limit = 800) {
  try {
    const ct = res.headers()['content-type'] || '';
    if (/application\/json/i.test(ct)) {
      const j = await res.json();
      return JSON.stringify(j, null, 2).slice(0, limit);
    }
    const t = await res.text();
    return t.slice(0, limit);
  } catch {
    return '<unreadable>';
  }
}

async function login(ctx: APIRequestContext, email: string, password: string) {
  const payload = { user: { email, password } };
  const headers = { 'Content-Type': 'application/json' };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await ctx.post('/api/users/login', { data: payload, headers });
    console.log(`🔐 login status=${res.status()} (attempt ${attempt})`);
    if (res.ok()) return await res.json();

    const st = res.status();
    if (![429, 500, 502, 503].includes(st)) {
      // non-transient: surface details
      const preview = await bodyPreview(res);
      throw new Error(`Login failed (${st}). Headers=${JSON.stringify(res.headers(), null, 2)}\nBody:\n${preview}`);
    }
    await new Promise((r) => setTimeout(r, 600 * attempt)); // small backoff
  }
  throw new Error('Login failed after retries (likely rate limit / transient issues).');
}

async function register(ctx: APIRequestContext, email: string, password: string, username: string) {
  const headers = { 'Content-Type': 'application/json' };
  const res = await ctx.post('/api/users', {
    headers,
    data: { user: { email, password, username } },
  });
  console.log(`📝 register status=${res.status()}`);
  // API may return 422 if user exists—treat as OK for idempotency
  if (![200, 201, 422].includes(res.status())) {
    const preview = await bodyPreview(res);
    throw new Error(`Register failed (${res.status()}). Body:\n${preview}`);
  }
}

setup('authentication', async () => {
  const { email, password } = getCreds('user'); // or 'admin' if you prefer
  console.log(`👤 Using credentials for ${email}`);

  ensureAuthFileSkeleton();

  const ctx = await newApi();

  // Try login first
  let token: string | undefined;
  try {
    const lr = await login(ctx, email, password);
    token = lr?.user?.token;
  } catch (e) {
    console.warn('⚠️ Login failed, will try register -> login. Details:\n' + (e as Error).message);
  }

  if (!token) {
    const username = email.split('@')[0];
    await register(ctx, email, password, username);
    const lr2 = await login(ctx, email, password);
    token = lr2?.user?.token;
  }

  expect(token, 'No token returned from login').toBeTruthy();
  console.log('🔹 Access token successfully retrieved from API login');

  // Persist token to .auth/user.json
  const userJson = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  const originBlock = userJson.origins?.[0];
  if (!originBlock) throw new Error('Invalid .auth/user.json structure.');

  const entry = originBlock.localStorage.find((x: any) => x.name === 'jwtToken');
  if (entry) entry.value = token;
  else originBlock.localStorage.push({ name: 'jwtToken', value: token });

  fs.writeFileSync(AUTH_FILE, JSON.stringify(userJson, null, 2));
  console.log('✅ Token written to .auth/user.json');

  process.env.ACCESS_TOKEN = token!;
  console.log('✅ Token stored in process.env.ACCESS_TOKEN for API usage');

  await ctx.dispose();
});