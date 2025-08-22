// global-teardown.ts
import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';

const API = 'https://conduit-api.bondaracademy.com';

async function globalTeardown() {
  const slugFile = path.join(__dirname, '.auth', 'globalArticle.json');
  const tokenFile = path.join(__dirname, '.auth', 'user.json');

  // Guard: only continue if slug + token exist
  if (!fs.existsSync(slugFile) || !fs.existsSync(tokenFile)) {
    console.log('🧹 Nothing to clean up (no slug/token file found).');
    return;
  }

  // Parse slug
  const slugJson = JSON.parse(fs.readFileSync(slugFile, 'utf-8'));
  const slug = slugJson?.slug;
  if (!slug) {
    console.log('🧹 No slug in slug file, skipping delete.');
    return;
  }

  // Parse token
  const tokenJson = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
  const token = tokenJson?.user?.token;
  if (!token) {
    console.log('🧹 No token in token file, skipping delete.');
    return;
  }

  console.log('🔥 articleCleanUp started!');
  const ctx = await request.newContext({ baseURL: API });
  try {
    const res = await ctx.delete(`/api/articles/${slug}`, {
      headers: { Authorization: `Token ${token}` },
    });
    const status = res.status();
    const body = await res.text();
    console.log(`Delete status: ${status}`);
    console.log(`Delete body: ${body}`);

    if (status === 204) {
      console.log('🧹 Article deleted in teardown.');
      fs.unlinkSync(slugFile);
      console.log('🧹 Slug file deleted after cleanup.');
    } else {
      console.warn('⚠️ Delete did not succeed, leaving slug file for inspection.');
    }
  } catch (e) {
    console.error('⚠️ Error during article cleanup:', e);
  } finally {
    await ctx.dispose();
  }
}

export default globalTeardown;