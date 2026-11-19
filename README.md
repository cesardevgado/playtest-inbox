# Playtest Inbox

**Did this bug actually get fixed in the next build?**

Playtest Inbox is a build-aware feedback tool for indie developers. Testers report without an account. Developers nominate a newer build for retesting. Testers verify the fix or reopen the issue, preserving the original report and every attempt.

This is a local portfolio MVP, not a deployed service. All demo content is fictional. Nothing connects to a game, emails a tester, or publishes to GitHub.

## Try it in two minutes

Requires Node.js 24 and npm.

```sh
npm ci
npm run setup
npm run dev
```

Open **http://127.0.0.1:3000** and start the demo. Each browser receives its own isolated sample workspace. Pick the mailbox issue, mark a fix ready in build 0.1.1, then switch to the tester view and verify or reopen it. Reopening requires a newer build before another retest.

No Docker or external account is required for this first run. By default, **PGlite runs real PostgreSQL compiled to WebAssembly** and persists locally in `.data/postgres`. The application uses the same SQL schema through `pg` when `DATABASE_URL` is configured.

## What is implemented

- Build-specific 192-bit random feedback links.
- Structured reports: title, reproduction steps, expected and actual results.
- Developer inbox with build/status filters and issue history.
- Enforced report → ready → verified/reopened state machine.
- A fresh, strictly newer build for every retest attempt.
- Private reporter ticket links; no reporter login or personal details collected.
- Isolated sample workspaces and an explicitly labeled demo role switch.
- Password-protected single-developer workspace, HTTP-only signed session cookie, origin checks, server-side validation and parameterized SQL.
- Transactional updates and conflict handling for repeated or concurrent retest submissions.
- Responsive, keyboard-accessible interface; browser/API test suite and CI configuration.

## Private local workspace

`npm run setup` writes random credentials into ignored `.env.local`, without overwriting existing configuration. Use the `DEVELOPER_PASSWORD` value there to sign in. The private workspace starts empty with two builds. Share a build feedback link with a tester; after submitting, they must keep their private ticket link to return and retest. A developer cannot verify their own fix in private mode merely by being signed in: the reporter ticket is required. Demo mode intentionally allows both roles.

Tokens are **bearer credentials**: anyone with a build link can submit reports; anyone with a ticket link can read and retest that ticket. Do not publish live links, `.env.local` or `.data`. The public source/demo distinction is deliberate.

## Optional standalone PostgreSQL

```sh
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
docker compose up -d
# Add the matching DATABASE_URL to .env.local before starting Next.js:
# postgresql://playtest:<your generated password>@127.0.0.1:5432/playtest
```

Schema setup runs automatically on first database use. Switching databases does not migrate existing data. PGlite is intended for local/single-process use, not horizontally scaled deployment.

## Checks

```sh
npm run format:check
npm run typecheck
npx playwright install chromium
npm test
npm run build
npm start
```

Stop an existing dev server before `npm test` if it uses different credentials: the test configuration uses fixed, fictional test-only credentials. Tests create temporary sample reports and a private test workspace in the selected database. **Do not run tests against real data.** CI covers embedded PostgreSQL and has a separate PostgreSQL 17 service job. Configuring a CI job does not mean it has run remotely.

## Architecture

- `app/page.tsx`: responsive inbox, anonymous report, and ticket views.
- `app/api/[...path]/route.ts`: same-origin HTTP endpoints and validation.
- `lib/security.ts`: session signing, credential comparison, input checks, local rate limits.
- `lib/service.ts`: workflow rules, transactional updates and sample seed.
- `lib/db.ts`: PostgreSQL schema and embedded/server adapters.
- `tests/`: workflow, authorization and UI checks.

See [verification status](docs/validation.md), [design decisions](docs/decisions.md) and [security and deployment limits](SECURITY.md).

## Scope and next steps

The first milestone is one report verified against a later build. No screenshots, uploads, GitHub sync, game plugin, email delivery, organizations or billing. Before a public release: select an open-source license, review the security checklist, configure hosting/database/secrets, and add a real authentication provider if supporting multiple developers. No license is selected by this initial scaffold; make that decision before public distribution.
