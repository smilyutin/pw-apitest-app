# Playwright API Test App

This repository demonstrates **API Security Testing** and **Functional Testing** using [Playwright](https://playwright.dev).  
It focuses on **OWASP API Security Top 10** categories, negative testing, and end-to-end automation for modern web applications.

---

## Project Structure

```
pw-apitest-app/
├── .auth/                  # Authentication artifacts (tokens, creds, articles)
├── .github/workflows/      # CI/CD pipelines (GitHub Actions)
├── playwright-report/      # HTML reports after test execution
├── test-data/              # Test data (JSON payloads, fixtures)
├── tests/                  # Organized test suites
│   ├── security/           # OWASP API Security categories
│   │   ├── abuse/          # Rate limiting, payload size, DoS
│   │   ├── authentication/ # Broken auth, JWT, brute-force
│   │   ├── authorization/  # IDOR, RBAC matrix
│   │   ├── cors/           # Cross-Origin checks
│   │   ├── csrf/           # CSRF protections
│   │   ├── headers/        # Security headers (CSP, HSTS, etc.)
│   │   ├── input/          # Injection tests (SQLi, XSS, file upload)
│   │   └── supply-chain/   # Dependencies, SRI checks
│   ├── utils/              # Helper functions (auth, tokens, JWT utils)
│   ├── auth.setup.ts       # Authentication setup scripts
│   ├── global-setup.ts     # Playwright global setup
│   ├── global-teardown.ts  # Cleanup scripts
│   └── workingWithApi.spec.ts # API interaction examples
├── package.json            # Dependencies & scripts
├── playwright.config.ts    # Playwright base configuration
├── README.md               # Project documentation
└── SECURITY-CHECKLIST.md   # API security checklist
```

---

## Features

-  Playwright-based **API & UI test automation**
-  Organized by **OWASP API Security Top 10**
-  Security-focused: authentication, authorization, headers, CSRF, CORS
-  CI-ready: integrated with **GitHub Actions**
-  Supports **global setup/teardown** for login tokens
-  Generates Playwright **HTML & trace reports**

---

## Setup

### Install dependencies
```bash
npm install
```

### Run tests
```bash
npx playwright test
```

### Run a specific test file
```bash
npx playwright test tests/security/authentication/jwt.spec.ts
```

### Run headed mode (debug)
```bash
npx playwright test --headed --debug
```

### Generate HTML report
```bash
npx playwright show-report
```

---

## Security Testing Coverage

This repo includes automated checks for:

- **Authentication** → login, logout, brute-force, JWT handling  
- **Authorization** → IDOR, RBAC matrix validation  
- **Input Validation** → SQL injection, XSS, file upload fuzzing  
- **CSRF & CORS** → misconfigurations, invalid token scenarios  
- **Headers** → CSP, HSTS, no-sniff, referrer policy  
- **Abuse** → rate-limiting, payload size abuse  
- **Supply Chain** → dependency integrity (SRI checks)  

---

## Reports

- **Playwright HTML Report** → stored in `playwright-report/`  
- **Trace Viewer** → view step-by-step execution with screenshots  
- **Security Checklist** → `SECURITY-CHECKLIST.md` for manual + automated verification  

---

## CI/CD (GitHub Actions)

The repo uses **GitHub Actions** (`.github/workflows/security.yml`) to:

- Install dependencies  
- Run Playwright tests in CI  
- Upload reports as artifacts  

---

## Next Steps

- Add **dynamic API fuzzing** integration  
- Integrate with **OWASP ZAP / Burp Suite** for deeper scans  
- Expand test coverage with **GraphQL security testing**  

---

## Contributing

1. Fork the repo  
2. Create your feature branch (`git checkout -b feature/awesome-test`)  
3. Commit your changes (`git commit -m 'Add new test case'`)  
4. Push to the branch (`git push origin feature/awesome-test`)  
5. Create a new Pull Request  

---

## License

This project is licensed under the MIT License.  
See the [LICENSE](LICENSE) file for details.
