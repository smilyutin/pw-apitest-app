// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import { getCreds } from './utils/creds';

// Load JWT token
let extraHeaders = {};
try {
  const userData = JSON.parse(fs.readFileSync('.auth/user.json', 'utf-8'));
  const token = userData?.origins?.[0]?.localStorage?.find((item: any) => item.name === 'jwtToken')?.value;
  if (token) {
    extraHeaders = { Authorization: `Token ${token}` };
    console.log('🔹 Loaded token from .auth/user.json');
  }
} catch {
  console.warn('⚠️ Token not loaded, setup will run first.');
}
const { baseUrl } = (() => {
  try { return getCreds(); } catch { return { baseUrl: undefined }; }
})();
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'], // Only real specs show in Test Explorer
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || baseUrl || 'https://conduit.bondaracademy.com',
    storageState: '.auth/user.json',
    headless: false,
    trace: 'on-first-retry',
    extraHTTPHeaders: extraHeaders,
  },
  globalSetup: require.resolve('./global-setup.ts'),
  globalTeardown: require.resolve('./global-teardown.ts'),

  projects: [
    // 🔹 Runs first in CLI
    {
  name: 'setup',
  testMatch: 'auth.setup.ts',
  use: {
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: {}, // do not send Authorization on login/register
  },
},

    // 🔹 Creates article for like tests
    { name: 'articleSetup', testMatch: 'newArticle.setup.ts', dependencies: ['setup'], teardown: 'articleCleanUp' },

    // 🔹 Runs your likeCounter test (GUI & CLI)
    { name: 'likeCounter', testMatch: 'likesCounter.spec.ts', use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' }, dependencies: ['articleSetup'] },

    // 🔹 Cleanup runs AFTER articleSetup finishes (automatically)
    { name: 'articleCleanUp', testMatch: 'articleCleanUp.setup.ts' },

    // 🔹 Optional regression tests
    { name: 'regression', testIgnore: 'likesCounter.spec.ts', use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' }, dependencies: ['setup'] },

    { name: 'likeCounterGlobal', testMatch: 'likesCounterGlobal.spec.ts', use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' }},
  
{
      name: 'security',
      testMatch: ['tests/security/**/*.spec.ts'], // <-- recursive subfolders
      use: { /*...*/ },
    },  ],
});