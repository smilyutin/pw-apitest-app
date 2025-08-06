import { test, expect } from '@playwright/test';
import fs from 'fs';

const slugFile = '.auth/article.json';

test('Like counter increase now', async ({ page }) => {
  test.slow();

  // 1️⃣ Load slug of the created article
  if (!fs.existsSync(slugFile)) throw new Error('❌ slugFile not found.');
  const { slugId } = JSON.parse(fs.readFileSync(slugFile, 'utf-8'));
  console.log('📝 Target slug for like:', slugId);

  // 2️⃣ Open Global Feed
  await page.goto('https://conduit.bondaracademy.com/');
  await page.getByText('Global Feed').click();

  // 3️⃣ Find the correct <app-article-preview> by checking if it has the preview link with the slug
  const articlePreview = page.locator('app-article-preview', {
    has: page.locator(`a[href="/article/${slugId}"]`)
  });

  // 4️⃣ Get the like button inside that article
  const likeButton = articlePreview.locator('app-favorite-button button');

  // 5️⃣ Verify like count starts at 0
  await expect(likeButton).toHaveText(/0/, { timeout: 5000 });

  // 6️⃣ Click like and verify it increments to 1
  await likeButton.click();
  await expect(likeButton).toHaveText(/1/, { timeout: 5000 });

  console.log(`✅ Liked article successfully: ${slugId}`);
});