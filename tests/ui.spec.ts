import { test, expect } from "@playwright/test";

test("UI closes the loop across builds and preserves reopened history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the interactive demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Moonlight Courier", exact: true }),
  ).toBeVisible();
  const workspace = await (await page.request.get("/api/workspace")).json();
  await page
    .getByRole("button", { name: "Report an issue", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Build tested")
    .selectOption(workspace.builds[0].token);
  await dialog
    .getByLabel("What went wrong?")
    .fill("UI test: pause overlay persists");
  await dialog.getByLabel("Steps to reproduce").fill("Pause, then resume.");
  await dialog.getByLabel("What did you expect?").fill("Menu closes.");
  await dialog.getByLabel("What actually happened?").fill("Menu stays open.");
  await dialog.getByRole("button", { name: "Submit report" }).click();
  await expect(dialog).not.toBeVisible();
  const detail = page.getByRole("article", { name: "Report details" });
  await expect(
    detail.getByRole("heading", { name: "UI test: pause overlay persists" }),
  ).toBeVisible();
  await detail
    .getByLabel("Build to retest")
    .selectOption(workspace.builds[1].id);
  await detail.getByLabel("Fix notes").fill("Reset menu visibility.");
  await detail.getByRole("button", { name: "Mark ready to retest" }).click();
  await page.getByRole("button", { name: "Tester", exact: true }).click();
  await detail
    .getByLabel("Retest notes")
    .fill("Still happens after opening twice.");
  await detail.getByRole("button", { name: "Still happening" }).click();
  await expect(detail.locator(".badge").first()).toHaveText("Reopened");
  await page.getByRole("button", { name: "Developer", exact: true }).click();
  await expect(
    detail.getByRole("button", { name: "Mark ready to retest" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "New build", exact: true }).click();
  await dialog.getByLabel("Build name").fill("Build C · UI fix");
  await dialog.getByRole("button", { name: "Create build" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(detail.getByLabel("Build to retest")).toContainText(
    "Build C · UI fix",
  );
  await detail.getByLabel("Fix notes").fill("Handle repeated pause actions.");
  await detail.getByRole("button", { name: "Mark ready to retest" }).click();
  await page.getByRole("button", { name: "Tester", exact: true }).click();
  await detail
    .getByLabel("Retest notes")
    .fill("Tested repeated pauses; menu closes each time.");
  await detail.getByRole("button", { name: "Verify fixed" }).click();
  await expect(
    detail.getByText("Fixed, with evidence.", { exact: true }),
  ).toBeVisible();
  await expect(detail.locator(".history li")).toHaveCount(5);
  await page.getByRole("button", { name: "Reopened", exact: true }).click();
  await expect(
    detail.getByRole("heading", { name: "UI test: pause overlay persists" }),
  ).toHaveCount(0);
});

test("mobile layout and modal keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Try the interactive demo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Try the interactive demo" }).click();
  const opener = page.getByRole("button", {
    name: "Report an issue",
    exact: true,
  });
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  const close = page.getByRole("button", { name: "Close report form" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Submit report", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await close.click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("anonymous report yields a private ticket rather than exposing the inbox", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the interactive demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Moonlight Courier", exact: true }),
  ).toBeVisible();
  const workspace = await (await page.request.get("/api/workspace")).json();
  const context = await browser.newContext();
  const tester = await context.newPage();
  await tester.goto(
    "http://127.0.0.1:3000/?report=" + workspace.builds[0].token,
  );
  await tester.getByLabel("What went wrong?").fill("Anonymous report");
  await tester.getByLabel("Steps to reproduce").fill("Open the pause menu.");
  await tester.getByLabel("What did you expect?").fill("A menu.");
  await tester.getByLabel("What actually happened?").fill("A blank screen.");
  await tester.getByRole("button", { name: "Submit report" }).click();
  await expect(
    tester.getByRole("heading", { name: "Report delivered." }),
  ).toBeVisible();
  await tester.getByRole("link", { name: "Open my ticket" }).click();
  await expect(
    tester.getByRole("heading", { name: "Anonymous report", exact: true }),
  ).toBeVisible();
  expect(
    (await tester.request.get("http://127.0.0.1:3000/api/workspace")).status(),
  ).toBe(401);
  await context.close();
});

test("Byte and Bug identify the two demo roles on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "Try the interactive demo" }).click();
  const dev = page.getByRole("button", { name: "Developer", exact: true });
  const tester = page.getByRole("button", { name: "Tester", exact: true });
  await expect(dev).toHaveText(/Developer.*Byte/);
  await expect(tester).toHaveText(/Tester.*Bug/);
  await expect(dev).toHaveAttribute("aria-pressed", "true");
  await expect(dev.locator(".role-mascot")).toHaveCSS(
    "background-image",
    /byte-and-bug\.png/,
  );
  expect((await page.request.get("/mascots/byte-and-bug.png")).ok()).toBe(true);
  await tester.click();
  await expect(tester).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
