import { test, expect, type APIRequestContext } from "@playwright/test";
import { sessionCookieIsSecure } from "../lib/demo";

const origin = "http://127.0.0.1:3001";
const sample = {
  title: "Test report in first demo",
  steps: "Walk into the mailbox.",
  expected: "Walk away from it.",
  actual: "Character sticks.",
};
const post = (api: APIRequestContext, path: string, data: object = {}) =>
  api.post("/api/" + path, { headers: { Origin: origin }, data });

test("hosted demo is isolated, expires after an hour, and resets cleanly", async ({
  request,
  playwright,
}) => {
  expect((await request.get("/api/health")).ok()).toBeTruthy();
  expect(await (await request.get("/api/config")).json()).toEqual({
    demoOnly: true,
  });
  expect(
    (
      await post(request, "login", {
        password: "demo-tests-private-password-not-for-deployment",
      })
    ).status(),
  ).toBe(404);
  expect((await request.get("/api/report?token=sample")).status()).toBe(404);
  expect((await request.get("/api/ticket?token=sample")).status()).toBe(404);
  expect((await post(request, "issues", sample)).status()).toBe(401);
  const start = await post(request, "demo");
  expect(start.ok()).toBeTruthy();
  expect(start.headers()["set-cookie"]).toMatch(/Max-Age=3600/);
  const first = await (await request.get("/api/workspace")).json();
  const [oldBuild, newBuild] = first.builds;
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    expect((await post(other, "demo")).ok()).toBeTruthy();
    const second = await (await other.get("/api/workspace")).json();
    expect(second.project.id).not.toEqual(first.project.id);
    expect(
      (
        await post(other, "issues", { ...sample, buildToken: oldBuild.token })
      ).status(),
    ).toBe(404);
    const reportResponse = await post(request, "issues", {
      ...sample,
      buildToken: oldBuild.token,
    });
    expect(reportResponse.status()).toBe(201);
    const report = await reportResponse.json();
    expect(report.reportToken).toBeUndefined();
    expect(
      (
        await post(request, `issues/${report.id}/ready`, {
          buildId: newBuild.id,
          note: "Updated movement.",
        })
      ).ok(),
    ).toBeTruthy();
    const retest = { outcome: "verified", note: "Character now moves." };
    expect(
      (await post(other, `issues/${report.id}/retest`, retest)).status(),
    ).toBe(404);
    expect(
      (await post(request, `issues/${report.id}/retest`, retest)).ok(),
    ).toBeTruthy();
    const updated = await (await request.get("/api/workspace")).json();
    expect(
      updated.issues.find((i: { id: string }) => i.id === report.id).status,
    ).toBe("verified");
    expect(
      (await (await other.get("/api/workspace")).json()).issues,
    ).toHaveLength(3);
    const stale = await playwright.request.newContext({
      baseURL: origin,
      storageState: await request.storageState(),
    });
    try {
      expect((await post(request, "demo")).ok()).toBeTruthy();
      expect((await stale.get("/api/workspace")).status()).toBe(401);
      const fresh = await (await request.get("/api/workspace")).json();
      expect(fresh.project.id).not.toBe(first.project.id);
      expect(fresh.issues).toHaveLength(3);
    } finally {
      await stale.dispose();
    }
  } finally {
    await other.dispose();
  }
});

test("public visitor can start and reset the sample workspace without private sign-in", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Your demo expires after one hour.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Developer sign in/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Try the interactive demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Moonlight Courier" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tester", exact: true }).click();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByRole("status")).toContainText("Demo reset");
  await expect(
    page.getByRole("button", { name: "Developer", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("demo limits bound submissions and preserve the sample inbox", async ({
  request,
}) => {
  expect((await post(request, "demo")).ok()).toBeTruthy();
  const workspace = await (await request.get("/api/workspace")).json();
  const [a, b] = workspace.builds;
  expect(
    (
      await post(request, "issues", {
        ...sample,
        title: "x".repeat(17000),
        buildToken: a.token,
      })
    ).status(),
  ).toBe(413);
  for (let i = 0; i < 17; i++) {
    expect(
      (
        await post(request, "issues", {
          ...sample,
          buildToken: (i % 2 ? a : b).token,
        })
      ).status(),
    ).toBe(201);
  }
  const full = await post(request, "issues", {
    ...sample,
    buildToken: b.token,
  });
  expect(full.status()).toBe(400);
  expect((await full.json()).error).toContain("inbox is full");
  for (let i = 0; i < 10; i++) {
    expect(
      (await post(request, "builds", { name: "Test build " + i })).status(),
    ).toBe(201);
  }
  expect(
    (await post(request, "builds", { name: "One build too many" })).status(),
  ).toBe(400);
});

test("production demo requires secure cookies except on local HTTP previews", () => {
  for (const origin of [
    "http://127.0.0.1:3116",
    "http://localhost:3116",
    "http://[::1]:3116",
  ]) {
    expect(sessionCookieIsSecure(origin, false, true)).toBe(false);
    expect(sessionCookieIsSecure(origin, true, true)).toBe(true);
  }
  expect(
    sessionCookieIsSecure("https://my-service.onrender.com", false, true),
  ).toBe(true);
  expect(sessionCookieIsSecure("https://localhost:3116", false, true)).toBe(
    true,
  );
  expect(
    sessionCookieIsSecure("http://my-service.onrender.com", false, true),
  ).toBe(true);
  expect(
    sessionCookieIsSecure("http://localhost.example.com", false, true),
  ).toBe(true);
});

test("concurrent demo writes preserve unique builds and a single retest result", async ({
  request,
}) => {
  expect((await post(request, "demo")).ok()).toBeTruthy();
  const workspace = await (await request.get("/api/workspace")).json();
  const ready = workspace.issues.find(
    (issue: { status: string }) => issue.status === "ready",
  );
  const buildResponses = await Promise.all([
    post(request, "builds", { name: "Duplicate build" }),
    post(request, "builds", { name: "Duplicate build" }),
  ]);
  expect(buildResponses.map((response) => response.status()).sort()).toEqual([
    201, 409,
  ]);
  const retestResponses = await Promise.all([
    post(request, `issues/${ready.id}/retest`, {
      outcome: "verified",
      note: "Works.",
    }),
    post(request, `issues/${ready.id}/retest`, {
      outcome: "verified",
      note: "Still works.",
    }),
  ]);
  expect(retestResponses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const after = await (await request.get("/api/workspace")).json();
  expect(
    after.issues.find((issue: { id: string }) => issue.id === ready.id).status,
  ).toBe("verified");
});
