# Design decisions

## Retesting belongs to a build

A fix note is not proof of a fix. An issue records the original build and a separate target build. Every transition adds an immutable event. Reopened reports retain the history instead of becoming duplicate issues. The next target must be newer than the most recently tested build.

## Demo access is not production authentication

The demo is isolated by a signed session and populated with fictional data. Its developer/tester switch is a teaching aid. The private workspace separately requires a configured password; a developer session does not authorize a reporter's retest. Anonymous testers use narrow ticket capabilities rather than a workspace login.

## Easy local setup, credible storage

PostgreSQL is used throughout, including via PGlite for a zero-Docker first run. The adapter switches to a normal PostgreSQL server using DATABASE_URL. Transactions enforce status changes and row locking prevents duplicate concurrent transitions. Schema-on-start is appropriate for the first slice; versioned migrations are a prerequisite before evolving a shared production database.

## Intentionally small

One project per session, one private developer workspace, and plain text reports. This makes the complete workflow inspectable without implying a full SaaS platform. The private project's seed name and build names are placeholders; project settings and a first-build onboarding flow are next-step refinements.
