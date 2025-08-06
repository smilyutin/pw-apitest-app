import { request, expect } from '@playwright/test';
import fs from 'fs';

export default async function globalTeardown() {
  const slugFile = '.auth/article.json';       // File where article slug is stored
  const userFile = '.auth/user.json';          // File where login token is stored

  // 🛑 If either file is missing, exit cleanup early
  if (!fs.existsSync(slugFile) || !fs.existsSync(userFile)) {
    console.warn('⚠️ Nothing to clean up.');
    return;
  }

  console.log('🔥 articleCleanUp started!');

  // 📥 Load slug and token
  const { slugId } = JSON.parse(fs.readFileSync(slugFile, 'utf-8'));
  const userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));

  // 🔑 Extract JWT token from storage
  const token = userData?.origins?.[0]?.localStorage?.find(
    (item: any) => item.name === 'jwtToken'
  )?.value;

  if (!token) throw new Error('❌ Token not found in user.json');

  // 🔧 Create a request context to send DELETE
  const context = await request.newContext();

  // 🗑️ Send DELETE request to remove article
  const response = await context.delete(
    `https://conduit-api.bondaracademy.com/api/articles/${slugId}`,
    {
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const status = response.status();
  const body = await response.text();

  // 🧾 Log response details
  console.log('Delete status:', status);
  console.log('Delete body:', body);

  // ✅ Expect 204 No Content response
  expect(status).toBe(204);

  // 🧹 Remove slug file after successful deletion
  fs.unlinkSync(slugFile);
  console.log('🧹 Congratulations, Slug file deleted!');
}