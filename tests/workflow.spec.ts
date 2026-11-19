import { test, expect, APIRequestContext } from "@playwright/test";
const headers = {
  Origin: "http://127.0.0.1:3000",
  "Content-Type": "application/json",
};
async function post(api: APIRequestContext, url: string, data: unknown = {}) {
  return api.post(url, { headers, data });
}
test("report → retest → reopen → new build → verify, with access isolation", async ({
  request,
  playwright,
}) => {
  expect((await post(request, "/api/demo")).ok()).toBeTruthy();
  let ws = await (await request.get("/api/workspace")).json();
  const [a, b] = ws.builds;
  const other = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  expect((await other.get("/api/workspace")).status()).toBe(401);
  expect(
    (
      await post(other, "/api/issues", {
        buildToken: a.token,
        title: "A valid issue",
        steps: "Walk into the wall.",
        expected: "Stop at the wall.",
        actual: "Fall through.",
      })
    ).status(),
  ).toBe(201);
  const created = await (
    await post(other, "/api/issues", {
      buildToken: a.token,
      title: "Jump does not reset",
      steps: "Jump twice.",
      expected: "Two jumps.",
      actual: "One jump.",
    })
  ).json();
  expect(created.reportToken).toHaveLength(48);
  expect(
    (
      await post(other, `/api/issues/${created.id}/ready`, {
        buildId: b.id,
        note: "Fixed",
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await post(request, `/api/issues/${created.id}/ready`, {
        buildId: a.id,
        note: "Fixed",
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post(request, `/api/issues/${created.id}/ready`, {
        buildId: b.id,
        note: "Reset cooldown.",
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await post(request, `/api/issues/${created.id}/ready`, {
        buildId: b.id,
        note: "Duplicate",
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await post(other, `/api/issues/${created.id}/retest`, {
        outcome: "verified",
        note: "Works",
        reportToken: "incorrect",
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await post(other, `/api/issues/${created.id}/retest`, {
        outcome: "reopened",
        note: "Still fails after restart.",
        reportToken: created.reportToken,
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await post(request, `/api/issues/${created.id}/ready`, {
        buildId: b.id,
        note: "Same build",
      })
    ).status(),
  ).toBe(400);
  const c = await (
    await post(request, "/api/builds", { name: "0.1.2 · Jump fixes" })
  ).json();
  expect(
    (
      await post(request, `/api/issues/${created.id}/ready`, {
        buildId: c.id,
        note: "Reset all cooldown paths.",
      })
    ).ok(),
  ).toBeTruthy();
  const results = await Promise.all([
    post(other, `/api/issues/${created.id}/retest`, {
      outcome: "verified",
      note: "Works now.",
      reportToken: created.reportToken,
    }),
    post(other, `/api/issues/${created.id}/retest`, {
      outcome: "verified",
      note: "Duplicate.",
      reportToken: created.reportToken,
    }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const ticket = await (
    await other.get("/api/ticket?token=" + created.reportToken)
  ).json();
  expect(ticket.issue.status).toBe("verified");
  expect(ticket.issue.events.map((e: { kind: string }) => e.kind)).toEqual([
    "reported",
    "ready",
    "reopened",
    "ready",
    "verified",
  ]);
  expect(ticket.issue.reported_build_id).toBe(a.id);
  expect(ticket.issue.target_build_id).toBe(c.id);
  expect(
    ticket.builds.every((b: Record<string, unknown>) => !b.token),
  ).toBeTruthy();
  await post(other, "/api/demo");
  expect(
    (
      await post(other, `/api/issues/${created.id}/ready`, {
        buildId: c.id,
        note: "Cross workspace",
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await post(other, `/api/issues/${created.id}/retest`, {
        outcome: "verified",
        note: "Cross workspace",
      })
    ).status(),
  ).toBe(404);
  await other.dispose();
});
test("validation, origin checks and developer authentication", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/demo", {
        data: {},
        headers: { Origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post("/api/demo", { data: {} })).status()).toBe(403);
  expect(
    (await post(request, "/api/login", { password: "wrong" })).status(),
  ).toBe(401);
  expect(
    (
      await post(request, "/api/login", {
        password: "local-test-password-for-ci-only",
      })
    ).ok(),
  ).toBeTruthy();
  const w = await (await request.get("/api/workspace")).json();
  expect(w.mode).toBe("private");
  expect(
    (
      await post(request, "/api/issues", {
        buildToken: w.builds[0].token,
        title: "",
        steps: "a",
        expected: "b",
        actual: "c",
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post(request, "/api/issues", {
        buildToken: "invalid",
        title: "test",
        steps: "a",
        expected: "b",
        actual: "c",
      })
    ).status(),
  ).toBe(404);
  expect(
    (await post(request, "/api/builds", { name: w.builds[0].name })).status(),
  ).toBe(409);
  await post(request, "/api/logout");
  expect((await request.get("/api/workspace")).status()).toBe(401);
});
