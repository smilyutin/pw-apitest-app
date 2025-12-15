// tests/articleCleanUp.setup.ts
import { test as teardown, expect } from './fixture/authed-request';
import { API } from './fixture/security-urls';
import fs from 'fs';

const slugFile = '.auth/article.json';
const userFile = '.auth/user.json';

teardown('delete article', async ({ request }) => {
  // 1 Load slug
  if (!fs.existsSync(slugFile)) throw new Error(' slugFile not found.');
  const { slugId } = JSON.parse(fs.readFileSync(slugFile, 'utf-8'));

  // 2 Load JWT token from user.json
  const userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
  const token = userData?.origins?.[0]?.localStorage?.find(
    (item: any) => item.name === 'jwtToken'
  )?.value;

  if (!token) throw new Error(' Token not found in .auth/user.json');

  console.log(` Attempting to delete article: ${slugId}`);
  console.log(' articleCleanUp started!');

  // 3 DELETE request
  const deleteResponse = await request.delete(
    `${API}/api/articles/${slugId}`,
    {
      headers: { Authorization: `Token ${token}` },
    }
  );

  const status = deleteResponse.status();
  const body = await deleteResponse.text();
  console.log('Delete status:', status);
  console.log('Delete body:', body);

  // 4 Verify deletion
  expect(status).toBe(204);

  // 5 Cleanup slug file
  fs.unlinkSync(slugFile);
  console.log('🧹 Slug file deleted after cleanup.');
});