import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const origin = "http://127.0.0.1:3001";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/demo-only.spec.ts",
  use: { ...base.use, baseURL: origin },
  webServer: {
    command: "npm run dev -- -p 3001",
    url: origin + "/api/health",
    reuseExistingServer: false,
    env: {
      DEMO_ONLY: "true",
      APP_ORIGIN: origin,
      SESSION_SECRET: "demo-tests-only-secret-not-for-real-deployment",
      DEVELOPER_PASSWORD: "demo-tests-private-password-not-for-deployment",
      DATABASE_URL: "not-a-database-url",
    },
  },
});
