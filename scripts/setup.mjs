import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env.local")) {
  console.log(".env.local already exists; left unchanged.");
} else {
  writeFileSync(
    ".env.local",
    `# Local development only. Never commit this file.\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nDEVELOPER_PASSWORD=${randomBytes(24).toString("base64url")}\nAPP_ORIGIN=http://127.0.0.1:3000\nCOOKIE_SECURE=false\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created .env.local with random local credentials. Run npm run dev. The demo needs no password. For the private workspace, find DEVELOPER_PASSWORD in .env.local.",
  );
}
