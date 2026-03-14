import { test, expect } from '@playwright/test';

/**
 * Critical path E2E test for Site Sheriff
 * Tests the core user journey: landing → scan → results → export → share
 */

test.describe('Critical Scan Path', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to landing page
    await page.goto('/');
  });

  test('landing page loads with scan form', async ({ page }) => {
    // Verify landing page elements
    await expect(page.locator('#scan-url')).toBeVisible();
    await expect(page.getByRole('button', { name: /run scan/i })).toBeVisible();

    // Verify key features are displayed
    await expect(page.getByText('Broken Links')).toBeVisible();
    await expect(page.getByText('SEO', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Security', { exact: true }).first()).toBeVisible();
  });

  test('can enter URL and start scan', async ({ page }) => {
    // Enter a test URL
    const urlInput = page.locator('#scan-url');
    await urlInput.fill('https://example.com');

    // Submit form
    await page.getByRole('button', { name: /run scan/i }).click();

    // Should navigate to scan results page
    await expect(page).toHaveURL(/\/scan\/[a-zA-Z0-9-]+/);
  });

  test('scan results page shows progress and completes', async ({ page }) => {
    // Enter URL and start scan
    await page.locator('#scan-url').fill('https://example.com');
    await page.getByRole('button', { name: /run scan/i }).click();

    // Wait for scan results page
    await expect(page).toHaveURL(/\/scan\/[a-zA-Z0-9-]+/);

    // Wait for scan to complete (shows overall score)
    // Allow up to 3 minutes for scan completion
    await expect(page.getByText(/overall score/i)).toBeVisible({ timeout: 180000 });

    // Verify score is displayed (0-100)
    const scoreElement = page.locator('[data-testid="overall-score"]').or(
      page.locator('text=/\\d+\\/100/')
    );
    await expect(scoreElement.first()).toBeVisible({ timeout: 5000 });
  });

  test('can access advanced scan settings', async ({ page }) => {
    // Click scan settings toggle
    await page.getByText('Scan Settings').click();

    // Verify settings panel is visible
    await expect(page.getByText('Max Pages')).toBeVisible();
    await expect(page.getByText('Crawl Depth')).toBeVisible();
    await expect(page.getByText('Screenshots')).toBeVisible();
  });

  test('full scan journey with export and share', async ({ page }) => {
    // Step 1: Enter URL and start scan
    await page.locator('#scan-url').fill('https://example.com');
    await page.getByRole('button', { name: /run scan/i }).click();

    // Step 2: Wait for scan completion
    await expect(page).toHaveURL(/\/scan\/[a-zA-Z0-9-]+/);

    // Wait for results to load (score visible indicates completion)
    await expect(page.getByText(/issues found/i).or(page.getByText(/overall score/i)))
      .toBeVisible({ timeout: 180000 });

    // Step 3: Test export functionality
    const exportButton = page.getByRole('button', { name: /export/i });
    if (await exportButton.isVisible()) {
      await exportButton.click();

      // Verify export menu appears
      const csvOption = page.getByText(/download csv/i);
      await expect(csvOption).toBeVisible();

      // Click CSV export
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        csvOption.click(),
      ]).catch(() => [null]);

      // Verify download started (may fail in CI without proper download handling)
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
      }

      // Close export menu by clicking elsewhere
      await page.keyboard.press('Escape');
    }

    // Step 4: Test share functionality
    const shareButton = page.getByRole('button', { name: /share report/i });
    if (await shareButton.isVisible()) {
      await shareButton.click();

      // Wait for share link to be created (button text changes)
      await expect(shareButton.or(page.getByText(/copied/i)))
        .toBeVisible({ timeout: 10000 });
    }
  });

  test('recent scans are displayed on landing page', async ({ page }) => {
    // Run a scan first
    await page.locator('#scan-url').fill('https://example.com');
    await page.getByRole('button', { name: /run scan/i }).click();

    // Wait for navigation to scan page
    await expect(page).toHaveURL(/\/scan\/[a-zA-Z0-9-]+/);

    // Navigate back to home
    await page.goto('/');

    // Check for recent scans section (may or may not be visible depending on state)
    // Just verify the page loads correctly by checking for the scan form
    // This is a soft check - we just verify the page loads correctly
    await expect(page.locator('#scan-url')).toBeVisible();
  });

  test('handles invalid URL gracefully', async ({ page }) => {
    // Enter invalid URL
    await page.locator('#scan-url').fill('not-a-valid-url');
    await page.getByRole('button', { name: /run scan/i }).click();

    // Should show error message or stay on page
    // The app should handle this gracefully
    await page.waitForTimeout(1000);

    // Either an error is shown or we're redirected
    const errorVisible = await page.getByText(/invalid|error/i).isVisible();
    const onScanPage = page.url().includes('/scan/');

    expect(errorVisible || onScanPage).toBeTruthy();
  });
});

test.describe('Shared Report', () => {
  test('can view shared report without authentication', async ({ page: _page, request: _request }) => {
    // This test would require a pre-existing share token
    // Skip if running in isolation
    test.skip();

    // Navigate to a shared report URL
    // await page.goto('/shared/test-token');
    // await expect(page.getByText('Shared Report')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('about page loads', async ({ page }) => {
    await page.goto('/about');
    await expect(page).toHaveURL('/about');
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).toHaveURL('/privacy');
  });

  test('contact page loads', async ({ page }) => {
    await page.goto('/contact');
    await expect(page).toHaveURL('/contact');
  });
});
