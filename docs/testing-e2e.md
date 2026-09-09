# End-to-end tests

Playwright harness for the onboarding ("preflight") flow at `/onboarding`. It
walks the flow from the first question to the hand-off for each org type, so
the org-type question matrix is verified by a run rather than by clicking.

Config: `playwright.config.ts`. Specs and helpers: `tests/e2e/`.

## Prerequisites

- Local Supabase running (`bunx supabase start`). The suite refuses to run
  against a non-local `PUBLIC_SUPABASE_URL`.
- `.env` present in the repo root with `PUBLIC_SUPABASE_URL`,
  `PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
- Playwright's browser downloaded once:
  `bunx playwright install chromium chromium-headless-shell`.

The suite starts its own dev server on port **5175** (`--strictPort`), so a
`bun run dev` you already have open on 5173 is left alone. Override with
`E2E_PORT`.

## Running

```
bun run test:e2e            # headless, full suite
bun run test:e2e:headed     # watch it drive the browser
bun run test:e2e -- --ui    # Playwright UI mode
```

Seeding and cleanup happen automatically in `globalSetup` / `globalTeardown`.
To hold the fixture users open and drive the flow by hand:

```
bun run test:e2e:seed       # reset, then seed
bun run test:e2e:clean      # remove the fixture
```

## What the fixture creates

`tests/e2e/setup/fixture.ts` seeds five auth users on
`@e2e-preflight.threadline.local`, one per walk. Each is email-confirmed, has a
profile row, has **no organization** and a null `profiles.onboarding_draft`.
That is the state preflight expects on a first visit: the org row does not
exist until `api/onboarding/create-org` (or `create-retailer`) runs part way
through General Information, and a leftover draft would open the flow at
question 2 or 3 instead of question 1.

Teardown deletes organizations named `E2E Preflight%` and every auth user on
the fixture domain. Both the emails and the org names are distinctive so
cleanup can never reach real data. Seeding runs teardown first, so a run you
killed halfway does not block the next one on a taken slug.

## Authentication

Threadline has no password login. The suite signs in the way a person does:
the real login UI, `signInWithOtp`, and the six-digit code read out of the
local mail catcher (Mailpit, on 54324, still called `inbucket` in
`supabase/config.toml`). See the comment at the top of `tests/e2e/setup/auth.ts`
for why it is not done by injecting cookies.

No change to `supabase/config.toml` is required. `[auth.email.test_otp]` stays
unset.

## Screenshots

Every step of every walk is captured to `tests/e2e/artifacts/<walk>/NN-step.png`
(gitignored). Failures additionally leave a trace in `test-results/`; open one
with `bunx playwright show-trace test-results/<dir>/trace.zip`.

## Known defects the suite records

`tests/e2e/rep-dead-ends.spec.ts` asserts the _current, broken_ behavior of two
rep steps on purpose. A rep org never has a self-brand, so the catalog step
refuses the upload and the orders step surfaces a raw backend 404 string. If
those steps are fixed, that spec fails, and the fix is to update the spec.
Do not change `src/routes/onboarding/` to make it pass.

## Debugging a failure

1. Read the screenshot sequence in `tests/e2e/artifacts/<walk>/`. The last file
   is the step that broke.
2. Open the trace: `bunx playwright show-trace test-results/<dir>/trace.zip`.
3. Re-run one spec headed:
   `bun run test:e2e:headed -- tests/e2e/rep-preflight.spec.ts`.
4. If the failure is "no sign-in code", check Mailpit at
   http://127.0.0.1:54324 and the local auth container.
5. If the failure is a question-copy mismatch, the flow changed and
   `tests/e2e/setup/questions.ts` is the one file to update. That file is the
   transcribed matrix; the specs read from it.
