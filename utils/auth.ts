// utils/auth.ts
import { request, APIRequestContext } from '@playwright/test';
import { getCreds } from './creds';

type Role = 'user' | 'admin';

// simple in-memory cache so we don’t re-login every time
const tokenCache: Partial<Record<Role, string>> = {};

export async function loginAndGetToken(role: Role = 'user'): Promise<string> {
  if (tokenCache[role]) return tokenCache[role]!;
  const { email, password, baseUrl } = getCreds(role);
  const API = (baseUrl?.replace(/\/$/, '') || 'https://conduit-api.bondaracademy.com') + '';

  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/api/users/login`, {
    data: { user: { email, password } },
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`[${role}] login failed: ${res.status()} ${res.statusText()} ${body}`);
  }

  const json = await res.json();
  const token = json?.user?.token as string | undefined;
  if (!token) throw new Error(`[${role}] login response missing token`);
  tokenCache[role] = token;
  await ctx.dispose();
  return token;
}

export async function authHeaders(role: Role = 'user') {
  const token = await loginAndGetToken(role);
  return {
    'Content-Type': 'application/json',
    Authorization: `Token ${token}`,
  };
}

/** Convenience for API-only tests: gives you a request context already authed */
export async function newAuthedRequestContext(role: Role = 'user'): Promise<APIRequestContext> {
  const { baseUrl } = getCreds(role);
  const API = (baseUrl?.replace(/\/$/, '') || 'https://conduit-api.bondaracademy.com') + '';
  const headers = await authHeaders(role);
  return request.newContext({ baseURL: API, extraHTTPHeaders: headers });
}