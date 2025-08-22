Security Test Suite Overview & Server Fixes

Authentication & Session
• Cookie flags: Secure, HttpOnly, SameSite=Lax/Strict.• JWT: signature integrity, expiration/nbf, alg=none/tamper resistance.• Session fixation: session ID must change after login.• Logout clears session (cookies/localStorage/sessionStorage).• Brute-force / lockout behavior (limited attempts, sane error messages).

Authorization
• IDOR: User B must not read/update/delete User A’s resources by changing IDs.• Role scoping: endpoints enforce least privilege (e.g., viewer vs admin).

Cross-Site Request Forgery (CSRF)
• Token required on state-changing requests (POST/PUT/DELETE).• Token bound to session (rotates, not reused across users).• Missing/invalid token → 403.

Input Validation & Output Encoding
• XSS: reflected & stored via typical payloads; responses should encode safely.• File upload: content-type & extension validation; server blocks path traversal.• SQLi/NoSQLi probing strings should not change results; errors should not leak stack traces.

Security Headers (UI responses)
• Content-Security-Policy: no unsafe-inline/unsafe-eval if possible.• X-Frame-Options or frame-ancestors in CSP (clickjacking protection).• X-Content-Type-Options: nosniff.• Referrer-Policy.• Permissions-Policy.• Strict-Transport-Security (on HTTPS).

Cross-Origin Resource Sharing (CORS)
• Preflight for disallowed origins must fail.• Only allow your known origins.• Credentials only allowed with exact origin match.

Availability & Abuse
• Rate limiting: burst requests capped (429), headers like Retry-After.• Large payloads rejected with 413.• Slowloris attacks (if simulated) must be rejected.

Supply Chain / Client Integrity
• 3rd-party scripts: CSP allowlist; Subresource Integrity (SRI) for CDN assets.• Dependency vulnerabilities: flagged and fixed regularly.

What to Fix on the Server
1. Return 401/403 for missing or invalid tokens, never 5xx.
2. Enforce ownership and RBAC checks before modifying/deleting resources.
3. Configure strict CORS: only allow approved origins, block others.
4. Add security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, etc).
5. Implement CSRF protection (token or double-submit cookies if session-based).
6. Apply rate limiting (e.g., on /login) and payload size limits.
7. Sanitize/escape user content to prevent XSS.
8. Validate uploads and block path traversal.
9. Parameterize DB queries and hide stack traces.
10. Add SRI to all external scripts and audit dependencies regularly.