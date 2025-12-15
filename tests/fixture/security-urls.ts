// tests/fixture/security-urls.ts
// Centralized URL configuration for security tests

/**
 * API endpoint URL - the backend API server
 * Can be overridden via API_ORIGIN environment variable
 */
export const API = process.env.API_ORIGIN ?? 'https://conduit-api.bondaracademy.com';

/**
 * App/UI endpoint URL - the frontend application
 * Can be overridden via UI_ORIGIN or APP_URL environment variable
 */
export const APP = process.env.UI_ORIGIN ?? process.env.APP_URL ?? 'https://conduit.bondaracademy.com';

/**
 * Trusted origin for CORS tests - same as APP
 * Represents a legitimate origin that should be allowed
 */
export const GOOD_ORIGIN = APP;

/**
 * Untrusted/malicious origin for CORS tests
 * Used to verify that the server rejects requests from unknown origins
 */
export const BAD_ORIGIN = 'https://evil.example';
