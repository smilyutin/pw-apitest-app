import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

/**
 * ==========================================
 * Load Token for API Requests
 * ==========================================
 * Reads the saved user session from `.auth/user.json` (created by `auth.setup.ts`).
 * Extracts the access token from localStorage and applies it to all API requests
 * via `extraHTTPHeaders`. This allows token-driven API calls without extra login.
 */
let extraHeaders = {};
try {
  const userData = JSON.parse(fs.readFileSync('.auth/user.json', 'utf-8'));

  // Navigate to the nested property where the token is stored in localStorage
  const token = userData?.origins?.[0]?.localStorage?.[0]?.value;

  if (token) {
    extraHeaders = { Authorization: `Token ${token}` };
    console.log('🔹 Loaded token from .auth/user.json');
  }
} catch {
  console.warn(
    '⚠️ Could not load token from .auth/user.json. API calls will be unauthenticated until setup runs.'
  );
}

/**
 * ==========================================
 * Playwright Test Configuration
 * ==========================================
 */
export default defineConfig({
  // -----------------------------
  // Test execution settings
  // -----------------------------
  testDir: './tests',           // Directory containing all your test files
  fullyParallel: true,          // Run tests in parallel for faster execution
  forbidOnly: !!process.env.CI, // Prevent accidental .only commits in CI
  retries: 0,                   // No retries by default
  workers: 1,                   // Run sequentially for easier debugging
  reporter: [['list']],         // List reporter; add ['html'] for visual reports

  // -----------------------------
  // Default behavior for all tests
  // -----------------------------
  use: {
    headless: false,                  // Run with a visible browser
    trace: 'on-first-retry',          // Capture trace only on first retry
    storageState: '.auth/user.json',  // Load logged-in session from setup
    extraHTTPHeaders: extraHeaders,   // Attach Authorization token for API calls
  },

  // -----------------------------
  // Project configuration
  // -----------------------------
  projects: [
    // 1️⃣ Setup Project
    // Runs `auth.setup.ts` first to generate .auth/user.json with token & cookies
    { 
      name: 'setup', 
      testMatch: 'auth.setup.ts' 
    },

    // 2️⃣ Chromium (Default browser)
    { 
      name: 'chromium', 
      use: { ...devices['Desktop Chrome'] }, 
      dependencies: ['setup']        // Ensure setup completes first
    },

    // 3️⃣ Firefox
    { 
      name: 'firefox', 
      use: { ...devices['Desktop Firefox'] }, 
      dependencies: ['setup'] 
    },

    // 4️⃣ Webkit (Safari)
    { 
      name: 'webkit', 
      use: { ...devices['Desktop Safari'] }, 
      dependencies: ['setup'] 
    },
  ],
});