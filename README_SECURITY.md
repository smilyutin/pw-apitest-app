 A. Authentication & Session
	•	Cookie flags: Secure, HttpOnly, SameSite checked (auth.cookies.spec.ts)
	•	JWT integrity: Reject tampered, expired, or alg=none tokens (jwt.spec.ts)
	•	Session fixation: Session ID must rotate on login (session-fixation.spec.ts)
	•	Logout hygiene: Cookies, localStorage, sessionStorage cleared (logout-clears-session.spec.ts)
	•	Brute-force: Repeated bad logins throttled/locked (bruteforce-lockout.spec.ts)

⸻

 B. Authorization (IDOR / RBAC)
	•	IDOR blocked: User B cannot modify User A’s articles (authorization/idor.spec.ts)
	•	Role scoping: Role matrix ensures least privilege (authorization/roleScoping.spec.ts)

⸻

 C. CSRF
	•	State change requires token: POST/PUT/DELETE require auth (crossSiteReqForgery/csrf.spec.ts)
	•	Token rotation: Tokens unique per user; ideally rotate on re-login (csrf-rotation.spec.ts)
	•	Missing/invalid token rejected: Consistent 401/403 responses (missing-invalid-token.spec.ts)

⸻

 D. Input Validation & Output Encoding
	•	XSS: Stored and reflected payloads do not execute (input/xss.spec.ts)
	•	SQLi/NoSQLi: Probes inert; errors don’t leak stack traces (input/sqli-nosqli.spec.ts)
	•	File upload: Type/extension enforced; no path traversal (input/file-upload.spec.ts)

⸻

 E. Security Headers (UI)
	•	CSP: Content-Security-Policy present and sane (headers/csp.spec.ts)
	•	Clickjacking: X-Frame-Options or frame-ancestors enforced (headers/clickjacking.spec.ts)
	•	NoSniff: X-Content-Type-Options: nosniff (headers/nosniff.spec.ts)
	•	Referrer-Policy: Sensitive data not leaked in headers (headers/referrer-policy.spec.ts)
	•	Permissions-Policy: Unused browser features disabled (headers/permissions-policy.spec.ts)
	•	HSTS: Strict-Transport-Security present on HTTPS (headers/hsts.spec.ts)

⸻

 F. CORS
	•	Preflight: Bad origins rejected, no wildcard with credentials (cors/cors.spec.ts)

⸻

 G. Availability & Abuse
	•	Rate limiting: Bursts capped with 429 and Retry-After (abuse/rate-limit.spec.ts)
	•	Payload abuse: Large payloads rejected (413); slowloris not accepted (abuse/payload-size.spec.ts)

⸻

 H. Supply Chain & Client Integrity
	•	3rd-party scripts: CSP allowlist + SRI required (supply-chain/csp-sri.spec.ts)
	•	Dependencies: CVEs flagged via npm audit / SCA

⸻

 CI/CD Integration
	•	Soft mode (SECURITY_SOFT=1): PRs warn but don’t fail.
	•	Strict mode: Main branch must pass all checks.
	•	Commands:
	•	Run all security tests: npm run test:sec
	•	Run subset: npx playwright test tests/security/headers

⸻

 Use this suite in CI to prevent regressions and catch common security gaps before release.