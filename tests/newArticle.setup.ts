// tests/newArticle.setup.ts
import { test as setup, expect } from './fixture/authed-request';
import { API } from './fixture/security-urls';
import fs from 'fs';

const slugFile = '.auth/article.json';

setup('create new article', async ({ request }) => {

  const timestamp = Date.now();
  const title = `Like title ${timestamp}`;
  const body = 'This article will be deleted in the test.';

  const articleResponse = await request.post(
    `${API}/api/articles`,
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

  console.log('Article created:', slugId);

  const articleData = {
    slugId,
    author: response.article.author.username
  };

  if (!fs.existsSync('.auth')) fs.mkdirSync('.auth');
  fs.writeFileSync(slugFile, JSON.stringify(articleData, null, 2));

  console.log(' Saved slug to', slugFile);
});