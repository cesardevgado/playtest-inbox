# Security and deployment boundaries

This MVP has not received an independent security audit and is not deployed.

Implemented: parameterized SQL, workspace-scoped developer reads/writes, random unguessable build/ticket tokens, password hashing before constant-time comparison, signed expiring HTTP-only SameSite=Strict session cookies, exact-origin checks on mutations, size/length validation, no third-party scripts or fonts, no-referrer responses, and transactional state changes. Passwords are not stored in the database. Demo reads never return reporter tokens. Ticket reads never return build submission tokens.

The Render demo start command requires demo-only mode, a signing secret, and an exact HTTPS origin. It refuses a developer password or PostgreSQL connection. The demo runs on one instance and uses only in-memory SQLite data. Private sessions, sign-in and external report/ticket links are disabled by the server; demo writes are scoped to the signed session. The session expires after one hour; expired workspaces are cleaned up when a new demo is started. Use Reset demo to discard a workspace immediately. Restarts wipe all demo workspaces.

The public demo bounds the number of active workspaces, builds, and reports. These are simple single-instance limits, not a substitute for a production abuse defense. Do not submit personal details or real reports.

Limitations before hosting real reports:

- A single developer password is a local starter, not user accounts, MFA, recovery or an audit of operator identity. Replace with an established authentication provider for shared use.
- Use a strong SESSION_SECRET, an explicit HTTPS APP_ORIGIN, and COOKIE_SECURE=true. `npm run build`/`npm start` require a configured signing secret before sessions can be issued. Never use CI secrets in deployment.
- Rate limits are process-local and global/per-link, not a distributed abuse defense. Add proxy-aware limits, storage quotas and durable abuse controls before exposing anonymous reporting.
- The app stops reading oversized JSON. Enforce request limits at the reverse proxy as well.
- Capability links do not expire or have revocation UI yet. Treat them as secrets. Redact URL queries and submission payloads from hosting/access logs. Do not use with sensitive real reports until rotation/revocation and retention controls exist.
- Outside demo-only mode, local sample workspaces are removed after 24 hours when a new demo is started. Local sessions expire after eight hours. Restarting development without SESSION_SECRET invalidates sessions.
- PGlite file storage supports a single app process only. Use PostgreSQL server for multi-process hosting, backups and operational recovery. No migration/backup system is provided yet.
- Configure an appropriate CSP, TLS termination, dependency-update process and monitoring for a public deployment.

Do not commit `.env*` (except the empty example), `.data`, credentials or real reports. Use only fictional data in screenshots and the public portfolio demo.
