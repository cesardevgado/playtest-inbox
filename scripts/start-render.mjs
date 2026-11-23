import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const env = process.env;
const origin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL;
const port = Number(env.PORT || "10000");

function fail(message) {
  console.error(message);
  process.exit(1);
}
if (env.DEMO_ONLY !== "true") fail("Set DEMO_ONLY=true for the public demo.");
if (env.DATABASE_URL || env.DEVELOPER_PASSWORD) {
  fail("Do not set DATABASE_URL or DEVELOPER_PASSWORD for the public demo.");
}
if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
  fail("Set SESSION_SECRET to a random secret of at least 32 characters.");
}
try {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin) throw new Error();
} catch {
  fail(
    "Set APP_ORIGIN to the exact public HTTPS origin, without a trailing slash.",
  );
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail("PORT must be a valid TCP port.");
}

const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    String(port),
  ],
  {
    stdio: "inherit",
    env: { ...env, APP_ORIGIN: origin, COOKIE_SECURE: "true" },
  },
);
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => fail(error.message));
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1));
});
