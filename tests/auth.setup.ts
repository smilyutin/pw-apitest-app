import { test as setup, expect } from './fixture/authed-request';
import user from '../.auth/user.json'
import fs from 'fs'

// ============================================================
// AUTH SETUP SCRIPT
// ============================================================
// This script runs before your Playwright projects to:
// 1. Log in via API (faster & more stable than UI login)
// 2. Save the authentication token to `.auth/user.json`
// 3. Update process.env.ACCESS_TOKEN for token-driven API calls
//
// After this script runs, your test projects can:
// - Use `storageState: '.auth/user.json'` to start as logged-in
// - Attach the token to API requests automatically via extraHTTPHeaders
// ============================================================

// Path where authenticated browser state is saved
const authFile = '.auth/user.json';

// Named "authentication" to indicate this setup handles login & state saving
// Named setup test that only runs once before dependent projects
setup('authentication', async ({ request }) => {
    // // 1️⃣ Navigate to the Conduit web app
    // await page.goto('https://conduit.bondaracademy.com/');

    // // 2️⃣ Go to the "Sign in" page
    // await page.getByText('Sign in').click();

    // // 3️⃣ Fill in user credentials
    // await page.getByRole('textbox', { name: 'Email' }).fill('1pwtest101@test.com');
    // await page.getByRole('textbox', { name: 'Password' }).fill('1pwtest101@test.com');

    // // 4️⃣ Click the Sign in button
    // await page.getByRole('button').click();

    // // 5️⃣ Wait for a known network request to confirm that login succeeded
    // // Here we wait for /api/tags which loads after a successful login
    // await page.waitForResponse('https://conduit-api.bondaracademy.com/api/tags');

    // // 6️⃣ Save the current browser storage state (cookies & local storage)
    // // This allows all subsequent tests to start as an already logged-in user
    // await page.context().storageState({ path: authFile });

    // // ✅ After running this setup, your tests can reference `storageState: '.auth/user.json'` in playwright.config.ts
    // // to skip UI login and run in an authenticated session

    // ------------------------------------------------------------
  // 1️⃣ Log in via API
  // Using API login is faster, avoids flaky UI steps, and works in headless mode.
  // ------------------------------------------------------------
  const loginResponse = await request.post(
    'https://conduit-api.bondaracademy.com/api/users/login',
    {
      data: {
        user: {
          email: '1pwtest101@test.com',
          password: '1pwtest101@test.com',
        },
      },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  // Validate API login response
  expect(loginResponse.ok()).toBeTruthy();

  // Parse the JSON response to extract the token
  const loginBody = await loginResponse.json();
  const accessToken = loginBody.user.token;
  console.log('🔹 Access token successfully retrieved from API login');

  // ------------------------------------------------------------
  // 2️⃣ Update the local .auth JSON to store the token
  // This allows Playwright to reuse the session for UI tests.
  // ------------------------------------------------------------
  // Update the token in the imported `.auth/user.json` object
  // Assumes token is stored in localStorage[0].value
  user.origins[0].localStorage[0].value = accessToken;

  // Persist the updated user data back to the auth file
  fs.writeFileSync(authFile, JSON.stringify(user, null, 2));
  console.log('✅ Token written to .auth/user.json');

  // ------------------------------------------------------------
  // 3️⃣ Expose token to runtime environment
  // This allows other tests to use `process.env.ACCESS_TOKEN` for API calls
  // without reading the JSON file again.
  // ------------------------------------------------------------
  process.env['ACCESS_TOKEN'] = accessToken;
  console.log('✅ Token stored in process.env.ACCESS_TOKEN for API usage');

  // At this point:
  // - UI tests can start with logged-in session (storageState)
  // - API tests can read token from `process.env.ACCESS_TOKEN`
});