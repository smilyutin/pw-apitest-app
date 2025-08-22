// global-teardown.ts
import { request as pwRequest, APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const API = 'https://conduit-api.bondaracademy.com';
const slugFile = path.join(process.cwd(), '.auth', 'article.json');
const userFile = path.join(process.cwd(), '.auth', 'user.json');

async function deleteWithToken(ctx: APIRequestContext, slug: string, token?: string) {
  if (!token) return { status: 0, body: 'no token' };
  const resp = await ctx.delete(`/api/articles/${slug}`, {
    headers: { Authorization: `Token ${token}` },
  });
  const status = resp.status();
  const body = await resp.text().catch(() => '');
  return { status, body };
}

export default async function globalTeardown() {
  // If there is no slug file, nothing to clean
  if (!fs.existsSync(slugFile)) {
    return;
  }

  let slug: string | undefined;
  try {
    const { slugId } = JSON.parse(fs.readFileSync(slugFile, 'utf-8'));
    slug = slugId;
  } catch {
    console.warn('⚠️ Could not parse slug file, skipping API delete.');
  }

  const ctx = await pwRequest.newContext({ baseURL: API });

  try {
    // Try token from .auth/user.json
    let token: string | undefined;
    try {
      const userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
      token = userData?.origins?.[0]?.localStorage?.find(
        (i: any) => i?.name === 'jwtToken'
      )?.value;
    } catch {
      console.warn('⚠️ Could not read token from .auth/user.json');
    }

    if (slug) {
      console.log('🔥 articleCleanUp started!');
      let res = await deleteWithToken(ctx, slug, token);
      console.log('Delete status:', res.status);
      console.log('Delete body:', res.body);

      // If forbidden, try ACCESS_TOKEN from env as a fallback (in case setup rotated it)
      if (res.status === 403 && process.env.ACCESS_TOKEN) {
        console.log('↪️ Retrying delete with ACCESS_TOKEN fallback…');
        res = await deleteWithToken(ctx, slug, process.env.ACCESS_TOKEN);
        console.log('Fallback delete status:', res.status);
        console.log('Fallback delete body:', res.body);
      }

      if (res.status !== 204) {
        // Don’t fail teardown; just warn so the suite can pass.
        console.warn(
          `⚠️ Teardown could not delete article (status ${res.status}). ` +
          `It may belong to a different user or token.`
        );
      } else {
        console.log('🧹 Article deleted in teardown.');
      }
    }
  } catch (e) {
    // Never throw from teardown; keep the suite green.
    console.warn('⚠️ Teardown error (ignored):', (e as Error).message);
  } finally {
    try {
      // Best-effort: remove the slug file either way so future runs don’t trip.
      fs.unlinkSync(slugFile);
      console.log('🧹 Slug file deleted after cleanup.');
    } catch {
      /* ignore */
    }
    await ctx.dispose();
  }
}