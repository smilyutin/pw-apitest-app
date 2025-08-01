import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

let extraHeaders = {};
try {
  const userData = JSON.parse(fs.readFileSync('.auth/user.json', 'utf-8'));
  const token = userData?.origins?.[0]?.localStorage?.[0]?.value;
  if (token) {
    extraHeaders = { Authorization: `Token ${token}` };
    console.log('🔹 Loaded token from .auth/user.json');
  }
} catch {
  console.warn('⚠️ Could not load token from .auth/user.json, API calls will be unauthenticated.');
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']], 

  use: {
    headless: false,
    trace: 'on-first-retry',
    storageState: '.auth/user.json', // Reuse the saved session for UI
    extraHTTPHeaders: extraHeaders,  // Auto-attach token to API calls
  },

  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'] },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, dependencies: ['setup'] },
  ],
});