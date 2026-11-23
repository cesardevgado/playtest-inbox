import { test, expect, type Locator } from "@playwright/test";

async function expectPortrait(avatar: Locator, mascot: "byte" | "bug") {
  await expect(avatar).toHaveAttribute("src", `/mascots/${mascot}.png`);
  await expect
    .poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(avatar).toHaveCSS("border-radius", "0px");
  await expect(avatar).toHaveCSS("object-fit", "contain");
  await expect(avatar).toHaveCSS("clip-path", "none");
  await expect(avatar).toHaveCSS("mask-image", "none");
  const frame = await avatar.evaluate((img: HTMLImageElement) => {
    const wrapper = img.closest(".role-avatar-frame")!;
    const frame = wrapper.getBoundingClientRect();
    const art = img.getBoundingClientRect();
    const centerX = frame.x + frame.width / 2;
    const centerY = frame.y + frame.height / 2;
    const backdrop = getComputedStyle(wrapper, "::before");
    return {
      width: frame.width,
      height: frame.height,
      radius: backdrop.borderRadius,
      overflow: getComputedStyle(wrapper).overflow,
      maxDistance: Math.max(
        ...[art.left, art.right].flatMap((x) =>
          [art.top, art.bottom].map((y) =>
            Math.hypot(x - centerX, y - centerY),
          ),
        ),
      ),
      innerRadius: frame.width / 2 - parseFloat(backdrop.borderLeftWidth),
    };
  });
  expect(frame.radius).toBe("50%");
  expect(frame.overflow).toBe("visible");
  expect(frame.height).toBe(frame.width);
  expect(frame.maxDistance).toBeLessThan(frame.innerRadius);
}

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
  await expect(tester.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "tester",
  );
  await expectPortrait(tester.locator(".external-role .role-avatar"), "bug");
  await tester.getByLabel("What went wrong?").fill("Anonymous report");
  await tester.getByLabel("Steps to reproduce").fill("Open the pause menu.");
  await tester.getByLabel("What did you expect?").fill("A menu.");
  await tester.getByLabel("What actually happened?").fill("A blank screen.");
  await tester.getByRole("button", { name: "Submit report" }).click();
  await expect(
    tester.getByRole("heading", { name: "Report delivered." }),
  ).toBeVisible();
  await tester.getByRole("link", { name: "Open my ticket" }).click();
  await expectPortrait(tester.locator(".external-role .role-avatar"), "bug");
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
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "developer",
  );
  const dev = page.getByRole("button", { name: "Developer", exact: true });
  const tester = page.getByRole("button", { name: "Tester", exact: true });
  await expect(dev).toHaveText(/Developer.*Byte/);
  await expect(tester).toHaveText(/Tester.*Bug/);
  await expect(dev).toHaveAttribute("aria-pressed", "true");
  for (const [button, mascot] of [
    [dev, "byte"],
    [tester, "bug"],
  ] as const) {
    const avatar = button.locator(".role-avatar");
    await expectPortrait(avatar, mascot);
    await expect(avatar).toHaveAttribute("alt", "");
    await expect(button.locator(".role-avatar-frame")).toHaveCSS(
      "width",
      "42px",
    );
  }
  await tester.click();
  await expect(tester).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "tester",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("landing uses larger, static role portraits", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const profiles = page.locator(".role-profiles .role-profile");
  await expect(profiles).toHaveCount(2);
  await expect(profiles.nth(0)).toHaveText(/Byte.*Developer/);
  await expect(profiles.nth(1)).toHaveText(/Bug.*Tester/);
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    for (const [index, mascot] of (["byte", "bug"] as const).entries()) {
      const avatar = profiles.nth(index).locator(".role-avatar");
      await expect(avatar).toHaveCSS("animation-name", "none");
      await expectPortrait(avatar, mascot);
      await expect(profiles.nth(index).locator(".role-avatar-frame")).toHaveCSS(
        "width",
        "72px",
      );
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("the Byte and Bug logo fits the header at mobile and desktop widths", async ({
  page,
}) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const home = page.getByRole("link", { name: "Playtest Inbox home" });
    await expect(home).toHaveCSS("font-size", "26px");
    const logo = home.locator("img");
    await expect(logo).toHaveAttribute("src", "/logo.png");
    await expect
      .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    const image = await logo.evaluate((img: HTMLImageElement) => {
      const { width, height } = img.getBoundingClientRect();
      return {
        actual: width / height,
        intrinsic: img.naturalWidth / img.naturalHeight,
      };
    });
    expect(image.actual).toBeCloseTo(image.intrinsic, 2);
    const brand = (await home.boundingBox())!;
    const signIn = (await page
      .getByRole("button", { name: /Developer sign in/ })
      .boundingBox())!;
    expect(brand.x + brand.width + 8).toBeLessThanOrEqual(signIn.x);
    expect(signIn.x + signIn.width).toBeLessThanOrEqual(width);
  }
});
