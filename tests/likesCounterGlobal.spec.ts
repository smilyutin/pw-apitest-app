import { test, expect } from './fixture/authed-request';
import { APP } from './fixture/security-urls';
import fs from 'fs';

const slugFile = '.auth/article.json';

test('Global like counter increase now', async ({ page }) => {
  test.slow();

  // 1 Load slug of the created article
  if (!fs.existsSync(slugFile)) throw new Error(' slugFile not found.');
  const content = fs.readFileSync(slugFile, 'utf-8');
  if (!content) throw new Error(' article.json is empty!');
  const { slugId } = JSON.parse(content);
  console.log('Target slug for like:', slugId);

  // 2 Open Global Feed
  await page.goto(APP, { waitUntil: 'load' });
await page.screenshot({ path: 'debug.png' }); // Save a screenshot
await expect(page.getByText('Global Feed')).toBeVisible({ timeout: 10000 });
  await page.getByText('Global Feed').click();

  // 3 Find the correct <app-article-preview> using the article slug
  const articlePreview = page.locator('app-article-preview', {
    has: page.locator(`a[href="/article/${slugId}"]`)
  });

  // 4 Get the like button inside that article
  const likeButton = articlePreview.locator('app-favorite-button button');

   // 5 Check current like count (could be 0 or 1)
  let text = await likeButton.textContent();
  let count = Number((text || '0').replace(/[^\d]/g, '') || 0);

  // If already liked (count > 0), unlike first
  if (count > 0) {
    await likeButton.click();
    await expect(likeButton).toHaveText(/0/, { timeout: 5000 });
    count = 0;
    }

// 6️ Now like the article and verify it increments to 1
  await likeButton.click();  
  await expect(likeButton).toHaveText(/1/, { timeout: 5000 });

  console.log(`Global liked article successfully: ${slugId}`);
});