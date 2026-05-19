# Self-Optimizing Agents

This guide describes how to structure, run, and iterate on self-optimizing agents in this repository. It focuses on Playwright-based testing agents and GitHub Actions integration.

## Goals
- Continuous improvement: Agents learn from execution logs and failure signals.
- Safe automation: Respect project conventions and security constraints.
- Fast feedback: Short iteration cycles with clear artifacts (logs, reports, tests).

## Architecture
- Planner: Generates a test plan from user intent.
- Executor: Runs steps interactively using Playwright tools.
- Logger: Captures detailed execution logs and artifacts.
- Synthesizer: Converts logs into stable tests and patches.
- Optimizer Loop: Compares outcomes to goals, applies minimal changes, re-runs.

## Tool Naming Conventions
Use underscore-separated tool identifiers. Examples:
- playwright_test_browser_click
- playwright_test_browser_drag
- playwright_test_browser_evaluate
- playwright_test_browser_file_upload
- playwright_test_browser_handle_dialog
- playwright_test_browser_hover
- playwright_test_browser_navigate
- playwright_test_browser_press_key
- playwright_test_browser_select_option
- playwright_test_browser_snapshot
- playwright_test_browser_type
- playwright_test_browser_verify_element_visible
- playwright_test_browser_verify_list_visible
- playwright_test_browser_verify_text_visible
- playwright_test_browser_verify_value
- playwright_test_browser_wait_for
- playwright_test_generator_read_log
- playwright_test_generator_setup_page
- playwright_test_generator_write_test

Avoid slashes in tool names (e.g., do not use `playwright-test/browser_click`).

## Agent Markdown Template
Use a front-matter block to declare tools and a brief description, followed by behavior rules.

---
description: Use this agent to create automated browser tests using Playwright.
tools: [
  'playwright_test_browser_click',
  'playwright_test_browser_type',
  'playwright_test_browser_verify_text_visible',
  'playwright_test_generator_setup_page',
  'playwright_test_generator_read_log',
  'playwright_test_generator_write_test'
]
---

- Obtain/validate the test plan.
- Run setup page for the scenario.
- Execute each plan step with matching intent.
- Read generator log; synthesize a single, stable spec.
- Write spec file to tests/ with scenario-based file name.

## Optimization Loop
1. Run the generated test.
2. Collect failures, logs, and flakiness signals.
3. Update locators or waits using minimal diffs.
4. Re-run and compare against targets (pass rate, duration).
5. Persist improvements only when they reduce failure or duration.

## GitHub Actions Integration
- Keep `on:` triggers enabled in workflow files.
- To suspend a workflow temporarily, use branch filters instead of commenting out `on:`.
- Upload Playwright artifacts for debugging: HTML report and test-results.

## Quick Start

### Local
```bash
# Install deps
npm ci

# Install Playwright browsers
npx playwright install --with-deps

# Run security suite
npx playwright test tests/security --reporter=html,line
```

### CI
- See .github/workflows/security.yml and copilot-setup-steps.yml.
- Ensure `on:` is present and properly indented.

## Best Practices
- Prefer small, focused patches.
- Use consistent selectors; avoid brittle text-only matches.
- Add explicit waits for navigation and network when needed.
- Keep CI noise low: only upload artifacts on failure or key branches.
