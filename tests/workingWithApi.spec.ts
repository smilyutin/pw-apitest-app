import { test, expect } from './fixture/authed-request';
import tags from '../test-data/tags.json';

test.beforeEach(async ({ page }) => {
  // 1️⃣ Mock the /api/tags endpoint to avoid real backend dependency
  await page.route('**/api/tags*', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tags),
    });
  });

  // 2️⃣ Navigate to the application as an already logged-in user
  // Login is handled via storageState from .auth/user.json
  await page.goto('https://conduit.bondaracademy.com/');
});


// ===============================
// DELETE ARTICLE TEST
// ===============================
test('delete article via API creation and UI deletion', async ({ page, request }) => {
  test.slow();

  /**
   * Step 1: Create article via API (Authorization auto-attached)
   */
  const createResponse = await request.post('https://conduit-api.bondaracademy.com/api/articles', {
    data: {
      article: {
        title: 'Delete Me Article',
        description: 'Created via API for UI deletion test',
        body: 'This article will be deleted in the test.',
        tagList: []
      },
    },
  });

  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json();
  const slug = createBody.article.slug;
  console.log(`✅ Article created via API with slug: ${slug}`);

  /**
   * Step 2: Visit article in UI and delete it
   */
  await page.goto(`https://conduit.bondaracademy.com/article/${slug}`);
  await expect(page.locator('.article-page h1')).toContainText('Delete Me Article');

  console.log('✅ EXPECT PASSED: Article is visible in the UI before deletion');

  // Click the "Delete Article" button (red outline)
  await page.locator('button.btn-outline-danger').first().click();

  /**
   * Step 3: Refresh feed and verify article is gone
   */
  await page.reload();
  await page.getByText('Global Feed').click();

  await expect(page.locator('app-article-list h1', { hasText: 'Delete Me Article' }))
    .toHaveCount(0);
  console.log('✅ EXPECT PASSED: Article successfully deleted and not visible in UI');
});


// ===============================
// CREATE ARTICLE TEST
// ===============================
test('create article and clean up via API', async ({ page, request }) => {
  test.slow();

  // Step 1: Prepare listener for article POST request BEFORE clicking Publish
  const postPromise = page.waitForResponse(resp =>
    resp.url().includes('/api/articles') && resp.request().method() === 'POST'
  );

  // Step 2: Create new article via UI
  await page.getByText('New Article').click();
  await page.getByRole('textbox', { name: 'Article Title' }).fill('Playwright is awesome');
  await page.getByRole('textbox', { name: "What's this article about?" }).fill('About the Playwright');
  await page.getByRole('textbox', { name: 'Write your article (in markdown)' }).fill('We like to use PW for automation');
  await page.getByRole('button', { name: 'Publish Article' }).click();

  // Step 3: Wait for POST /api/articles response (listener was set before click)
  const articleResponse = await postPromise;
  const articleResponseBody = await articleResponse.json();
  const slugId = articleResponseBody.article.slug;
  console.log(`✅ Article created via UI with slug: ${slugId}`);

  // Step 4: Validate article appears in UI
  await expect(page.locator('.article-page h1')).toContainText('Playwright is awesome');

  // Step 5: Delete article via API using token from storageState (token-driven)
  const deleteResponse = await request.delete(
    `https://conduit-api.bondaracademy.com/api/articles/${slugId}`
  );
  expect(deleteResponse.status()).toBe(204);
  console.log('✅ Article deleted via API');

  // Step 6: Confirm article is gone from feed
  await page.goto('https://conduit.bondaracademy.com/');
  await page.getByText('Global Feed').click();
  await expect(page.locator('app-article-list h1', { hasText: 'Playwright is awesome' })).toHaveCount(0);
  console.log('✅ EXPECT PASSED: Article successfully removed from the UI feed');
});