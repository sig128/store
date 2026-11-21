import { expect, test, type Page } from "@playwright/test";

/**
 * The actual buying journey, driven through the UI against the local payment
 * simulator (development only). Run on a narrow phone with reduced motion and
 * on desktop. These do not claim a real Stripe/PayPal payment.
 */

async function addToBag(page: Page, slug: string, size: string) {
  await page.goto(`/products/${slug}`);
  await page.getByRole("radio", { name: new RegExp(`^${size}(,|$)`) }).first().click();
  await page.getByRole("button", { name: /^Add to bag/ }).click();
  await expect(page.getByRole("dialog", { name: /Your bag/ })).toBeVisible();
}

async function fillCheckout(page: Page, email = "buyer@example.com") {
  await page.goto("/checkout");
  await page.getByLabel("Email for your receipt").fill(email);
  await page.getByLabel("Full name").fill("Kari Nordmann");
  await page.getByLabel("Street address").fill("Storgata 1");
  await page.getByLabel("Postal code").fill("0155");
  await page.getByLabel("City").fill("Oslo");
  await expect(page.getByRole("radiogroup", { name: "Delivery method" })).toBeVisible();
  await page.getByRole("checkbox", { name: /I accept the/ }).check();
}

test("buy a tee by card via the simulator and see verified confirmation", async ({ page }) => {
  await addToBag(page, "last-set-pump-cover-tee", "M");
  await fillCheckout(page);
  await page.getByRole("button", { name: /by card/ }).click();
  await expect(page).toHaveURL(/\/dev\/simulator\//);
  await expect(page.getByText("LOCAL PAYMENT SIMULATOR")).toBeVisible();
  await page.getByRole("button", { name: "Pay now (succeeds)" }).click();
  await expect(page).toHaveURL(/\/checkout\/complete/);
  await expect(page.getByRole("heading", { name: "Locked in." })).toBeVisible();
  await expect(page.getByText(/Payment confirmed/)).toBeVisible();
  // the bag is emptied only after verified payment
  await expect(page.getByRole("button", { name: /Open bag, 0 items/ })).toBeVisible();
});

test("PayPal-style approve then server capture", async ({ page }) => {
  await addToBag(page, "floor-work-training-shorts", "S");
  await fillCheckout(page, "wallet@example.com");
  await page.getByRole("button", { name: "Pay with PayPal" }).click();
  await expect(page).toHaveURL(/\/dev\/simulator\//);
  await page.getByRole("button", { name: /Approve payment/ }).click();
  await expect(page.getByRole("heading", { name: "Locked in." })).toBeVisible();
});

test("late webhook: thank-you page says confirming until the server verifies", async ({ page }) => {
  await addToBag(page, "night-run-stringer", "M");
  await fillCheckout(page, "late@example.com");
  await page.getByRole("button", { name: /by card/ }).click();
  await page.getByRole("button", { name: /webhook arrives late/ }).click();
  await expect(page.getByRole("heading", { name: /Confirming payment/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Locked in." })).toBeVisible({ timeout: 30_000 });
});

test("cancelled checkout returns to checkout with nothing charged", async ({ page }) => {
  await addToBag(page, "after-hours-heavyweight-hoodie", "L");
  await fillCheckout(page, "cancel@example.com");
  await page.getByRole("button", { name: /by card/ }).click();
  await page.getByRole("button", { name: /Cancel and return/ }).click();
  await expect(page.getByText(/Payment was cancelled. Nothing was charged/)).toBeVisible();
  // bag still holds the item
  await expect(page.getByRole("button", { name: /Open bag, 1 item/ })).toBeVisible();
});

test("Locker Tag: live preview, spelling confirmation and snapshot in the bag", async ({ page }) => {
  await page.goto("/products/heat-check-training-singlet");
  await page.getByRole("radio", { name: /^M(,|$)/ }).first().click();
  await page.getByRole("checkbox", { name: /Locker Tag/ }).check();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("nord");
  await page.getByRole("textbox", { name: "Number", exact: true }).fill("13");
  await page.getByRole("button", { name: /^Add to bag/ }).click();
  await expect(page.getByText(/Finish your Locker Tag/)).toBeVisible();
  await page.getByRole("checkbox", { name: /checked the spelling/ }).check();
  await page.getByRole("button", { name: /^Add to bag/ }).click();
  await expect(page.getByRole("dialog", { name: /Your bag/ }).getByText(/Locker Tag: NORD · 13/)).toBeVisible();
});

test("order pages are private: a guessed order number shows nothing", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/orders/AHA-10001");
  await expect(page.getByText(/orders can only be opened from the secure link/)).toBeVisible();
  await expect(page.getByText("Kari Nordmann")).toHaveCount(0);
  const res = await page.request.get("/api/orders/status?order=00000000-0000-0000-0000-000000000000");
  expect(res.status()).toBe(404);
  await ctx.close();
});
