// tests/fixtures/authed-request.ts
import { test as base, APIRequestContext, request, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://conduit-api.bondaracademy.com';
const AUTH_FILE = path.join(process.cwd(), '.auth/user.json');

// Read jwtToken from your saved storage state
function readToken(): string | undefined {
  try {
    const user = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    return user?.origins?.[0]?.localStorage?.find((i: any) => i.name === 'jwtToken')?.value;
  } catch {
    return undefined;
  }
}

// Decide which endpoints **must** be authed
function requiresAuth(url: string, method: string): boolean {
  const u = new URL(url, BASE_URL);
  const p = u.pathname;
  const m = method.toUpperCase();

  // Sensitive reads
  if (p === '/api/user') return true;

  // Mutations should always be authed
  if (m !== 'GET') return true;

  // Optionally enforce auth for some GETs (uncomment as needed)
  // if (p.startsWith('/api/articles/feed')) return true;

  return false;
}

// Wrap APIRequestContext to assert Authorization presence
function wrapWithAuthGuard(ctx: APIRequestContext): APIRequestContext {
  const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const;

  return new Proxy(ctx, {
    get(target, prop: string, receiver) {
      if (METHODS.includes(prop as any)) {
        return async (...args: any[]) => {
          const [url, options = {}] = args as [string, any];
          const headers = options.headers ?? {};
          const hasAuth =
            typeof headers.Authorization === 'string' ||
            typeof headers.authorization === 'string' ||
            // Also consider auth added via context.extraHTTPHeaders
            false;

          if (requiresAuth(url, options.method ?? (prop === 'fetch' ? 'GET' : prop)) && !hasAuth) {
            throw new Error(
              `[AUTH GUARD] Missing Authorization header for ${options.method ?? prop} ${url}. ` +
              `Attach "Authorization: Token <jwt>" or use the authedRequest fixture as intended.`
            );
          }
          return (target as any)[prop].apply(target, args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as APIRequestContext;
}

type Fixtures = {
  authedRequest: APIRequestContext;
};

export const test = base.extend<Fixtures>({
  authedRequest: async ({}, use) => {
    const token = readToken();
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: token ? { Authorization: `Token ${token}` } : {},
    });
    const guarded = wrapWithAuthGuard(ctx);
    await use(guarded);
    await ctx.dispose();
  },
});

export { expect };