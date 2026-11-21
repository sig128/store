import { expect, test, type Page } from "@playwright/test";

/**
 * Operator journey on desktop: a paid simulator order is produced, packed,
 * shipped with tracking and partly refunded, with each step audited — and a
 * read-only role can't do any of it. Dev owner credentials come from the seed.
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "Admin is tested on desktop");
});

const OWNER = { email: process.env.E2E_ADMIN_EMAIL ?? "owner@afterhours.test", password: process.env.E2E_ADMIN_PASSWORD ?? "after-hours-dev-owner-1" };

async function buyOne(page: Page, email: string) {
  await page.goto("/products/floor-work-training-shorts");
  await page.getByRole("radio", { name: /^M(,|$)/ }).first().click();
  await page.getByRole("button", { name: /^Add to bag/ }).click();
  await expect(page.getByRole("dialog", { name: /Your bag/ })).toBeVisible();
  await page.goto("/checkout");
  await page.getByLabel("Email for your receipt").fill(email);
  await page.getByLabel("Full name").fill("Ola Nordmann");
  await page.getByLabel("Street address").fill("Kirkegata 2");
  await page.getByLabel("Postal code").fill("0153");
  await page.getByLabel("City").fill("Oslo");
  await expect(page.getByRole("radiogroup", { name: "Delivery method" })).toBeVisible();
  await page.getByRole("checkbox", { name: /I accept the/ }).check();
  await page.getByRole("button", { name: /by card/ }).click();
  await page.getByRole("button", { name: "Pay now (succeeds)" }).click();
  await expect(page.getByRole("heading", { name: "Locked in." })).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("owner fulfils, ships and refunds a paid order; viewer is read-only", async ({ page, browser }) => {
  const buyer = `admin-e2e-${Date.now()}@example.com`;
  await buyOne(page, buyer);

  await signIn(page, OWNER.email, OWNER.password);
  await page.goto(`/admin/orders?q=${encodeURIComponent(buyer)}`);
  await page.getByRole("link", { name: /^AHA-\d+$/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/AHA-\d+/);
  const orderUrl = page.url();

  // printable documents
  const slip = await page.context().newPage();
  await slip.goto(`${orderUrl}/packing-slip`);
  await expect(slip.getByText("Packing slip")).toBeVisible();
  await expect(slip.getByText("FW-")).toBeVisible();
  await slip.goto(`${orderUrl}/supplier-sheet`);
  await expect(slip.getByRole("heading", { name: "Supplier order sheet" })).toBeVisible();
  await slip.close();

  await page.getByRole("button", { name: "Mark in production" }).click();
  await expect(page.locator("main p[role=status]")).toBeVisible();
  await page.getByRole("button", { name: "Mark packed" }).click();
  await expect(page.locator("main p[role=status]")).toBeVisible();
  await page.getByLabel("Tracking number").fill("70701234567890999");
  await page.getByRole("button", { name: "Mark shipped" }).click();
  await expect(page.locator("main p[role=status]")).toContainText(/shipped/i);
  await expect(page.getByText("70701234567890999").first()).toBeVisible();
  await expect(page.locator('a[href="https://sporing.posten.no/sporing/70701234567890999"]').first()).toBeVisible();

  // refund needs explicit confirmation
  await page.getByLabel(/^Amount/).fill("100");
  await page.getByRole("button", { name: "Issue refund" }).click();
  await expect(page.locator("main p[role=alert]")).toContainText(/confirm/i);
  await page.getByLabel(/^Amount/).fill("100");
  await page.getByRole("checkbox", { name: /I confirm this refund/ }).check();
  await page.getByRole("button", { name: "Issue refund" }).click();
  await expect(page.locator("main p[role=status]")).toContainText(/refund/i);
  await expect(page.getByText(/succeeded/).first()).toBeVisible();

  await page.goto("/admin/audit?action=refund.");
  await expect(page.getByText(/Refund 100\.00 NOK requested/).first()).toBeVisible();

  // a viewer can look but not act
  const viewerEmail = `viewer-${Date.now()}@afterhours.test`;
  await page.goto("/admin/users");
  const add = page.locator("form", { has: page.getByRole("button", { name: "Create user" }) });
  await add.getByLabel("Email").fill(viewerEmail);
  await add.getByLabel("Role").selectOption("viewer");
  await add.getByLabel("Temporary password").fill("viewer-password-123");
  await add.getByRole("button", { name: "Create user" }).click();
  await expect(page.locator("main p[role=status]")).toContainText(/created/i);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const v = await ctx.newPage();
  await signIn(v, viewerEmail, "viewer-password-123");
  await v.goto(orderUrl);
  await expect(v.getByRole("heading", { level: 1 })).toHaveText(/AHA-\d+/);
  await expect(v.getByRole("button", { name: "Issue refund" })).toHaveCount(0);
  await expect(v.getByRole("button", { name: "Mark shipped" })).toHaveCount(0);
  await v.goto("/admin/settings");
  await expect(v).toHaveURL(/\/admin\/forbidden/);
  const exportRes = await v.request.get("/admin/production/export");
  expect(exportRes.status()).toBe(403);
  await ctx.close();
});
