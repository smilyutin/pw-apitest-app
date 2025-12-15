import { test, expect } from './fixture/authed-request';
import { APP } from './fixture/security-urls';
import fs from 'fs';

const slugFile = '.auth/article.json';

test('Like counter increase now', async ({ page }) => {
  test.slow();

  // 1 Load slug of the created article
  if (!fs.existsSync(slugFile)) throw new Error(' slugFile not found.');
  const { slugId } = JSON.parse(fs.readFileSync(slugFile, 'utf-8'));
  console.log(' Target slug for like:', slugId);

  // 2 Open Global Feed
  await page.goto(APP);
  await page.getByText('Global Feed').click();

  // 3 Find the correct <app-article-preview> by checking if it has the preview link with the slug
  const articlePreview = page.locator('app-article-preview', {
    has: page.locator(`a[href="/article/${slugId}"]`)
  });

  // 4 Get the like button inside that article
  const likeButton = articlePreview.locator('app-favorite-button button');

  // 5 Verify like count starts at 0
  await expect(likeButton).toHaveText(/0/, { timeout: 5000 });

  // 6 Click like and verify it increments to 1
  await likeButton.click();
  await expect(likeButton).toHaveText(/1/, { timeout: 5000 });

  console.log(` Liked article successfully: ${slugId}`);
});