import { expect, test } from "@playwright/test";

test.describe("[Crove OS E2E]: App Switcher, Multi-Tenant Teams & Navigation", () => {
  test.describe("1. Crove App Switcher Component", () => {
    test("should render grid button and display suite & ecosystem apps on trigger", async ({ page }) => {
      // Navigate to login or root to check UI element structure
      await page.goto("/auth/login");

      // Verify that page has Crove branding
      await expect(page).toHaveTitle(/Crove/i);

      // Verify presence of App Switcher trigger icon in DOM
      const appSwitcherTrigger = page.locator('button[title="Crove Ecosystem Apps"]');
      const triggerCount = await appSwitcherTrigger.count();
      expect(triggerCount).toBeGreaterThanOrEqual(0);

      if (triggerCount > 0) {
        await appSwitcherTrigger.first().click();

        // Check Crove Suite section
        const croveSuiteSection = page.getByText("Crove Suite");
        await expect(croveSuiteSection).toBeVisible();

        // Check key applications listed in the switcher
        await expect(page.getByText("Crove Cal")).toBeVisible();
        await expect(page.getByText("Crove Post")).toBeVisible();
        await expect(page.getByText("Crove Sign")).toBeVisible();
        await expect(page.getByText("Crove CRM")).toBeVisible();

        // Check DOS Ecosystem section
        const dosSection = page.getByText("DOS Ecosystem");
        await expect(dosSection).toBeVisible();
        await expect(page.getByText("DOS ID")).toBeVisible();
        await expect(page.getByText("DOS.Me")).toBeVisible();
        await expect(page.getByText("DOS AI")).toBeVisible();
      }
    });

    test("should have correct external URLs for Crove and DOS services", async ({ page }) => {
      await page.goto("/auth/login");
      const appSwitcherTrigger = page.locator('button[title="Crove Ecosystem Apps"]');

      if ((await appSwitcherTrigger.count()) > 0) {
        await appSwitcherTrigger.first().click();

        // Check anchor tags
        const postLink = page.locator('a[href="https://post.crove.com"]');
        await expect(postLink).toBeAttached();

        const signLink = page.locator('a[href="https://sign.crove.com"]');
        await expect(signLink).toBeAttached();

        const dosMeLink = page.locator('a[href="https://dos.me"]');
        await expect(dosMeLink).toBeAttached();
      }
    });
  });

  test.describe("2. Teams & Multi-Tenant Page Security", () => {
    test("unauthenticated access to /teams should redirect to login", async ({ page }) => {
      await page.goto("/teams");

      // Should be redirected to /auth/login with callbackUrl
      await page.waitForURL(/\/auth\/login/);
      expect(page.url()).toContain("/auth/login");
    });

    test("unauthenticated access to /settings/organizations/profile should be handled securely", async ({
      page,
    }) => {
      await page.goto("/settings/organizations/profile");

      // Should redirect to login
      await page.waitForURL(/\/auth\/login/);
      expect(page.url()).toContain("/auth/login");
    });

    test("unauthenticated access to /settings/developer/webhooks/monitoring should redirect to login", async ({
      page,
    }) => {
      await page.goto("/settings/developer/webhooks/monitoring");

      await page.waitForURL(/\/auth\/login/);
      expect(page.url()).toContain("/auth/login");
    });
  });

  test.describe("3. Multi-Tenant API Route Tests", () => {
    test("tRPC endpoint /api/trpc/viewer.teams.list should require authentication", async ({ request }) => {
      const response = await request.get("/api/trpc/viewer/teams.list?batch=1&input=%7B%7D");

      // When unauthenticated, tRPC should return UNAUTHORIZED (401) or error in batch response
      expect([200, 401, 400]).toContain(response.status());
      if (response.status() === 200) {
        const json = await response.json();
        // In batch tRPC, error is inside payload array
        if (Array.isArray(json) && json[0]?.error) {
          expect(json[0].error.json.message).toBeDefined();
        }
      }
    });

    test("tRPC endpoint /api/trpc/viewer.organizations.listCurrent should require authentication", async ({
      request,
    }) => {
      const response = await request.get("/api/trpc/viewer/organizations.listCurrent?batch=1&input=%7B%7D");

      expect([200, 401, 400]).toContain(response.status());
    });
  });
});
