// tests/newArticle.setup.ts
import { test as setup, expect } from './fixture/authed-request';
import fs from 'fs';

const slugFile = '.auth/article.json';

setup('create new article', async ({ request }) => {
  // 1️⃣ Generate unique title and slug
  const timestamp = Date.now();
  const title = `Like title ${timestamp}`;
  const body = 'This article will be deleted in the test.';

  // 2️⃣ POST create article using auth token (via Playwright request)
  const articleResponse = await request.post(
    'https://conduit-api.bondaracademy.com/api/articles',
    {
      data: {
        article: {
          title,
          description: 'Created via API for likes',
          body,
          tagList: []
        }
      }
    }
  );

  console.log('Create status:', articleResponse.status());
  expect(articleResponse.status()).toBe(201);

  const response = await articleResponse.json();
  const slugId = response.article.slug;

  console.log('✅ Article created:', slugId);

  // 3️⃣ Save slug & author for teardown
  const articleData = {
    slugId,
    author: response.article.author.username
  };

  if (!fs.existsSync('.auth')) fs.mkdirSync('.auth');
  fs.writeFileSync(slugFile, JSON.stringify(articleData, null, 2));

  console.log('📝 Saved slug to', slugFile);
});