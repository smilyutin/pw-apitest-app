# 🛡️ Security Test Summary (CI-ready)

**Mode:** `${{ env.SECURITY_SOFT == '1' && 'Soft (warn only)' || 'Strict' }}`

## A. Authentication & Session
- [ ] Cookie flags set (Secure, HttpOnly, SameSite=Lax/Strict) — `auth.cookies.spec.ts`
- [ ] JWT integrity & expiry checks — `jwt.spec.ts`
- [ ] Session fixation prevented on login — `session-fixation.spec.ts`
- [ ] Logout clears cookies/localStorage/sessionStorage — `logout-clears-session.spec.ts`
- [ ] Brute-force throttling/lockout — `bruteforce-lockout.spec.ts`

## B. Authorization (IDOR / RBAC)
- [ ] Cross-tenant article updates/deletes blocked — `authorization/idor.spec.ts`
- [ ] Role matrix enforced (least privilege) — `authorization/roleScoping.spec.ts`

## C. CSRF
- [ ] State change requires auth token (POST/PUT/DELETE) — `crossSiteReqForgery/csrf.spec.ts`
- [ ] Token uniqueness/rotation sanity — `crossSiteReqForgery/csrf-rotation.spec.ts`
- [ ] Missing/invalid token rejected — `crossSiteReqForgery/missing-invalid-token.spec.ts`

## D. Input Validation & Output Encoding
- [ ] XSS (stored & URL injection) sanitized — `input/xss.spec.ts`
- [ ] SQLi/NoSQLi probes inert & no error leakage — `input/sqli-nosqli.spec.ts`
- [ ] File upload validation: type, extension; no traversal — `input/file-upload.spec.ts`

## E. Security Headers (UI)
- [ ] Content-Security-Policy sane — `headers/csp.spec.ts`
- [ ] Clickjacking: X-Frame-Options or frame-ancestors — `headers/clickjacking.spec.ts`
- [ ] X-Content-Type-Options: nosniff — `headers/nosniff.spec.ts`
- [ ] Referrer-Policy — `headers/referrer-policy.spec.ts`
- [ ] Permissions-Policy — `headers/permissions-policy.spec.ts`
- [ ] Strict-Transport-Security (HTTPS) — `headers/hsts.spec.ts`

## F. CORS
- [ ] Preflight blocks disallowed origins; credentials only with exact allowlist — `cors/cors.spec.ts`

## G. Availability & Abuse
- [ ] Rate limiting (429, Retry-After) — `abuse/rate-limit.spec.ts`
- [ ] Large payloads rejected (413); slowloris not accepted — `abuse/payload-size.spec.ts`

## H. Supply Chain / Client Integrity
- [ ] 3rd-party scripts: CSP allowlist + SRI — `supply-chain/csp-sri.spec.ts`
- [ ] Dependency vulnerabilities monitored — (run `npm audit` / SCA)

---

### How to reproduce locally

```bash
# Soft mode (warnings only, good for PRs)
SECURITY_SOFT=1 npx playwright test tests/security

# Strict mode (will fail the run on findings)
npx playwright test tests/security
```

### CI job pointers

- **Soft** on PRs, **Strict** on `main`/`master`.
- Job file: `.github/workflows/security-checks.yml`.
- UI target (override if needed):
  - `UI_ORIGIN=https://conduit.bondaracademy.com`

---

**Legend**
- ✅ Pass — All checks green.
- ⚠️ Soft warn — Failing checks reported but job succeeds (PRs).
- ❌ Fail — Failing checks block merge (main/master strict).