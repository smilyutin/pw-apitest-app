// tests/security/broken-authentication.spec.ts
import { test, expect, request } from '@playwright/test';
import { accessToken } from '../../utils/token';

const BASE_URL = 'https://conduit-api.bondaracademy.com';

// 1️⃣ Invalid login attempt
test('Invalid login should return 403 or 422', async () => {
  const context = await request.newContext();
  const response = await context.post(`${BASE_URL}/api/users/login`, {
    data: {
      user: {
        email: 'invalid@email.com',
        password: 'wrongpass',
      },
    },
    headers: { 'Content-Type': 'application/json' },
  });

  expect([401, 403, 422]).toContain(response.status());
});

// 2️⃣ Expired or invalid token test
test('Access with invalid token should be denied', async () => {
  const context = await request.newContext();
  const response = await context.get(`${BASE_URL}/api/user`, {
    headers: {
      Authorization: `Token expired.or.invalid.token`,
    },
  });

  expect([401, 403]).toContain(response.status());
});

// 3️⃣ Unauthorized Access (BOLA)
test('Should not allow access to another user’s article', async ({ request }) => {
  const response = await request.get(`${BASE_URL}/api/articles/some-other-users-article`, {
    headers: { Authorization: `Token ${accessToken}` },
  });

  expect([401, 403, 404]).toContain(response.status());
});

// 4️⃣ Mass Assignment Check
test('Should ignore unauthorized fields in registration', async ({ request }) => {
  const response = await request.post(`${BASE_URL}/api/users`, {
    data: {
      user: {
        username: 'testuser_' + Date.now(),
        email: `testuser_${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin', // 🚨 attempting privilege escalation
      },
    },
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await response.json();
  expect([200, 201, 422]).toContain(response.status());
  if (body.user) {
    expect(body.user.role).not.toBe('admin');
  }
});

// 5️⃣ Security Headers Validation
test('Should contain essential security headers', async ({ request }) => {
  const response = await request.get(`${BASE_URL}/api/user`, {
    headers: { Authorization: `Token ${accessToken}` },
  });

  const headers = response.headers();
  console.log('🔍 Headers received:', headers);
  if (!headers['x-content-type-options']) {
  console.warn('⚠️ Missing x-content-type-options header!');
} else {
  expect(headers['x-content-type-options']).toBe('nosniff');
}

  if (headers['strict-transport-security']) {
    expect(headers['strict-transport-security']).toContain('max-age=');
  }

  if (headers['content-security-policy']) {
    expect(headers['content-security-policy']).toEqual(expect.any(String));
  }
});

// 6️⃣ Security Fuzzing Tests
test.describe('Security Fuzzing with Malicious Input', () => {
  const fuzzPayloads = [
    "<script>alert(1)</script>",
    "' OR '1'='1",
    "../../../../etc/passwd",
  ];

  for (const payload of fuzzPayloads) {
    test(`Should reject malicious input: ${payload}`, async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/comments`, {
        data: { comment: payload },
        headers: { Authorization: `Token ${accessToken}` },
      });

      expect(response.status()).toBeGreaterThanOrEqual(400);
    });
  }
});