import { test as setup, expect, request } from '@playwright/test';
import user from '../.auth/user.json'
import fs from 'fs'

// Path where the authenticated browser state (cookies, localStorage, sessionStorage) will be saved
// This file will be reused in tests to skip UI login
const authFile = '.auth/user.json';

// Named "authentication" to indicate this setup handles login & state saving
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

    const loginResponse = await request.post('https://conduit-api.bondaracademy.com/api/users/login', {
    data: {
      user: {
        email: '1pwtest101@test.com',
        password: '1pwtest101@test.com',
      },
    },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(loginResponse.ok()).toBeTruthy();
  const loginBody = await loginResponse.json();
  const accessToken = loginBody.user.token;
  user.origins[0].localStorage[0].value = accessToken
  fs.writeFileSync(authFile, JSON.stringify(user))

  process.env['ACCESS_TOKEN'] = accessToken
    console.log('✅ Token stored in process.env.ACCESS_TOKEN for API usage');


})