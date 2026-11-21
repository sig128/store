import { expect, test, type Page } from "@playwright/test";

/** Keyboard-only shopping: skip link, size radios with arrow keys, add to bag, close the bag with Escape. */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "Keyboard journey runs on desktop");
});

async function tabUntil(page: Page, check: () => Promise<boolean>, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await check()) return;
  }
  throw new Error("Focus never reached the target");
}

test("buy-path is fully keyboard operable", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /skip to content/i })).toBeFocused();
  await tabUntil(page, async () => (await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "")).startsWith("Shop Drop 01"));

  await page.goto("/products/night-run-stringer");
  await tabUntil(page, async () => (await page.evaluate(() => document.activeElement?.getAttribute("role"))) === "radio");
  const before = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await page.keyboard.press("ArrowRight");
  const after = await page.evaluate(() => ({ label: document.activeElement?.getAttribute("aria-label"), checked: document.activeElement?.getAttribute("aria-checked") }));
  expect(after.label).not.toBe(before);
  expect(after.checked).toBe("true");

  await tabUntil(page, async () => /^Add to bag/.test((await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "")) || ""));
  await page.keyboard.press("Enter");
  const bag = page.getByRole("dialog", { name: /Your bag/ });
  await expect(bag).toBeVisible();
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog")))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(bag).toBeHidden();
});
