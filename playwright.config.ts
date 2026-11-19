import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/api/workspace",
    reuseExistingServer: !process.env.CI,
    env: {
      APP_ORIGIN: "http://127.0.0.1:3000",
      SESSION_SECRET: "local-test-session-secret-not-for-real-deployment",
      DEVELOPER_PASSWORD: "local-test-password-for-ci-only",
    },
  },
  reporter: "list",
});
