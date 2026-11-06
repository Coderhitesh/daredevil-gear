// Guest customer journey: browse → search → product → cart → checkout up to payment.
// Payment itself is CCAvenue's hosted flow; without keys the API answers 503 and the
// checkout must show a clear message and release the held stock (no fake success).
const { test, expect } = require('@playwright/test');

test.describe('storefront journey', () => {
  test('home page shows GST-inclusive pricing promise and categories', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/DareDevil Gears/i);
    await expect(page.getByText(/inclusive of GST/i).first()).toBeVisible();
    await expect(page.locator('main a[href^="/category/"]').first()).toBeVisible();
  });

  test('search finds products and tolerates a typo', async ({ page }) => {
    await page.goto('/search?q=torhc');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
  });

  test('legal pages are reachable from the footer', async ({ page }) => {
    await page.goto('/');
    for (const label of [/privacy/i, /terms/i, /grievance/i]) {
      await expect(page.locator('footer').getByRole('link', { name: label }).first()).toBeVisible();
    }
  });

  test('add to cart and reach checkout', async ({ page, isMobile }) => {
    await page.goto('/shop?sort=price_asc');
    const first = page.locator('a[href^="/product/"]').first();
    await first.click();
    await expect(page.getByText(/inclusive of all taxes/i).first()).toBeVisible();
    await page.waitForLoadState('networkidle'); // wait for hydration before interacting
    const add = page.getByRole('button', { name: 'Add to cart', exact: true });
    test.skip(!(await add.isEnabled()), 'first product is out of stock in this database');
    await add.click();
    await expect(page.getByRole('dialog', { name: /your cart/i })).toBeVisible();
    await page.getByRole('link', { name: /^checkout$/i }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await page.waitForLoadState('networkidle');

    const form = page.locator('#checkout-form');
    await form.getByLabel(/^Email/).fill('e2e-guest@example.com');
    await form.getByLabel('Full name').first().fill('E2E Guest');
    await form.getByLabel('Full name').first().blur();
    await form.getByLabel('Mobile number').fill('9876543210');
    await form.getByLabel(/House \/ flat/).fill('12 Test Road');
    await form.getByLabel('PIN code').fill('201310');
    await form.getByLabel(/City/).fill('Greater Noida');
    await form.getByLabel(/State/).selectOption('Uttar Pradesh');
    await expect(page.getByText(/Standard delivery/).first()).toBeVisible();
    // delivery name is copied from the contact name
    await expect(form.getByLabel('Full name').nth(1)).toHaveValue('E2E Guest');

    const ageBox = form.getByLabel(/18 years|aged 18/i);
    if (await ageBox.count()) await ageBox.check();
    await page.getByRole('button', { name: /^Pay ₹/ }).click();
    // Either CCAvenue's page opens (keys configured) or the store explains payments are unavailable.
    const unavailable = page.getByRole('alert').filter({ hasText: /payment|not configured|unavailable/i });
    await Promise.race([page.waitForURL(/ccavenue\.com/, { timeout: 20_000 }), expect(unavailable.first()).toBeVisible({ timeout: 20_000 })]);
    test.info().annotations.push({ type: 'mobile', description: String(isMobile) });
  });
});
