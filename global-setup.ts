import { request, expect } from '@playwright/test';
import fs from 'fs';

async function globalSetup() {
  const authFile = '.auth/user.json';           // Storage for login session
  const slugFile = '.auth/article.json';        // Storage for created article slug

  //  1. Create API request context
  const context = await request.newContext();

  //  2. Login to Conduit API and get token
  const loginResponse = await context.post('https://conduit-api.bondaracademy.com/api/users/login', {
    data: {
      user: {
        email: '1pwtest101@test.com',
        password: '1pwtest101@test.com',
      },
    },
    headers: { 'Content-Type': 'application/json' },
  });

  //  Assert login worked
  expect(loginResponse.ok()).toBeTruthy();
  // 🔑 Extract token from response
  const loginBody = await loginResponse.json();
  const accessToken = loginBody.user.token;

  //  3. Save token in .auth/user.json (used for UI session in storageState)
  const userData = {
    origins: [{
      origin: 'https://conduit.bondaracademy.com',
      localStorage: [{
        name: 'jwtToken',
        value: accessToken
      }]
    }]
  };

  fs.mkdirSync('.auth', { recursive: true });                         // Ensure .auth folder exists
  fs.writeFileSync(authFile, JSON.stringify(userData, null, 2));     // Save token to file
  console.log('✅ Token saved to user.json');

  //  4. Create a new article with unique title
  const articleResponse = await context.post(
    'https://conduit-api.bondaracademy.com/api/articles',
    {
      data: {
        article: {
          title: `Global like title ${Date.now()}`,
          description: "Created via globalSetup",
          body: "Bondar Academy is a leading platform for efficient education, designed to boost your technical skills and advance your career in Quality Assurance (QA)...",
          tagList: []
        }
      },
      headers: { Authorization: `Token ${accessToken}` }
    }
  );

  //  Verify article creation success
  expect(articleResponse.status()).toBe(201);

  //  5. Save article slug for later test reference and deletion
  const articleBody = await articleResponse.json();
  const slugId = articleBody.article.slug;

  fs.writeFileSync(slugFile, JSON.stringify({ slugId }, null, 2));
  console.log(`Article created: ${slugId}`);
}

export default globalSetup;