import { test, expect, request as requestInternal } from '@playwright/test';
import tags from '../test-data/tags.json';

// Run before each test
test.beforeEach(async ({ page }) => {
  // Mock the /api/tags endpoint with local tag data to isolate external dependency
  await page.route('**/api/tags*', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tags),
    });
  });

  // Navigate to application and perform UI login
  await page.goto('https://conduit.bondaracademy.com/');
  await page.getByText('Sign in').click();
  await page.getByRole('textbox', { name: 'Email' }).fill('1pwtest101@test.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('1pwtest101@test.com');
  await page.getByRole('button').click();
});

test('delete the article', async ({ page }) => {
  test.slow(); // Mark the test as slow in the report

  // Create isolated request context for API calls
  const requestContext = await requestInternal.newContext();

  // Log in via API to get authentication token
  const loginResponse = await requestContext.post('https://conduit-api.bondaracademy.com/api/users/login', {
    data: {
      user: {
        email: '1pwtest101@test.com',
        password: '1pwtest101@test.com'
      }
    },
    headers: { 'Content-Type': 'application/json' }
  });

  // Ensure login was successful in UI and API
  await expect(page.getByRole('link', { name: '1pwtest101@test.com' })).toBeVisible();
  expect(loginResponse.ok()).toBeTruthy();

  const loginBody = await loginResponse.json();
  const token = loginBody.user.token;

  // Create an article via API
  const createResponse = await requestContext.post('https://conduit-api.bondaracademy.com/api/articles', {
    data: {
      article: {
        title: 'This is a test title eh',
        description: 'This is a test description',
        body: 'This is a test body',
        tagList: []
      }
    },
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`
    }
  });

  // Confirm article creation success and extract slug
  expect(createResponse.ok()).toBeTruthy();
  const articleData = await createResponse.json();
  expect(articleData.article?.slug).toBeTruthy();
  const slug = articleData.article.slug;

  // Delete the article via API using the slug
  const deleteResponse = await requestContext.delete(
    `https://conduit-api.bondaracademy.com/api/articles/${slug}`,
    {
      headers: { Authorization: `Token ${token}` }
    }
  );

  // Confirm successful deletion (HTTP 204)
  expect(deleteResponse.status()).toBe(204);

  // Check that the article no longer appears in the UI
  await page.getByText('Global Feed').click();
  await expect(page.locator('app-article-list h1')).not.toContainText('This is a test title eh');
});

test('create article', async ({ page }) => {
  // Create article via UI interaction
  await page.getByText('New Article').click();
  await page.getByRole('textbox', { name: 'Article Title' }).fill('Playwright is awesome');
  await page.getByRole('textbox', { name: "What's this article about?" }).fill('About the Playwright');
  await page.getByRole('textbox', { name: 'Write your article (in markdown)' }).fill('We like to use PW for automation');
  await page.getByRole('button', { name: 'Publish Article' }).click();

  // Wait for POST response and validate slug returned
  const articleResponse = await page.waitForResponse(resp =>
    resp.url().includes('/api/articles') && resp.request().method() === 'POST'
  );

  const articleResponseBody = await articleResponse.json();
  expect(articleResponseBody.article?.slug).toBeTruthy();
  const slugId = articleResponseBody.article.slug;

  // Validate that article is shown in UI
  await expect(page.locator('.article-page h1')).toContainText('Playwright is awesome');
  await page.getByText('Home').click();
  await page.getByText('Global Feed').click();

  test.slow(); // Mark the test as slow for visibility

  // Confirm article presence in feed with visual log
  try {
    await expect(page.locator('app-article-list h1').first()).toContainText('Playwright is awesome');
    console.log('✅ EXPECT PASSED: Article \'Playwright is awesome\' created successfully');
  } catch (error) {
    console.error('❌ EXPECT FAILED: Article \'Playwright is awesome\' was not found in the list');
    throw error;
  }

  // Cleanup: Log in via API and delete the article
  const requestContext = await requestInternal.newContext();
  const loginResponse = await requestContext.post('https://conduit-api.bondaracademy.com/api/users/login', {
    data: {
      user: {
        email: '1pwtest101@test.com',
        password: '1pwtest101@test.com'
      }
    },
    headers: { 'Content-Type': 'application/json' }
  });

  expect(loginResponse.ok()).toBeTruthy();
  const loginJson = await loginResponse.json();
  const accessToken = loginJson.user.token;

  const deleteResponse = await requestContext.delete(
    `https://conduit-api.bondaracademy.com/api/articles/${slugId}`,
    {
      headers: { Authorization: `Token ${accessToken}` }
    }
  );

  // Confirm the article is deleted successfully
  expect(deleteResponse.status()).toBe(204);

  // Refresh page and validate article no longer present
  await page.reload();

  try {
    await expect(page.locator('app-article-list h1', { hasText: 'Playwright is awesome' })).toHaveCount(0);
    console.log('✅ EXPECT PASSED: Article was successfully deleted and removed from the list');
  } catch (error) {
    console.error('❌ EXPECT FAILED: Deleted article still appears in the UI');
    throw error;
  }
});