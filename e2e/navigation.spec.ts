import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('displays all navigation links', async ({ page }) => {
    await page.goto('/');

    // Check that navigation is visible
    await expect(page.getByRole('heading', { name: /13F Follower/i })).toBeVisible();

    // Check all navigation links
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Funds' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rebalance' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Recommendations' })).toBeVisible();
  });

  test('navigates to different pages', async ({ page }) => {
    await page.goto('/');

    // Navigate to Funds page
    await page.getByRole('link', { name: 'Funds' }).click();
    await expect(page).toHaveURL('/funds');

    // Navigate to Rebalance page
    await page.getByRole('link', { name: 'Rebalance' }).click();
    await expect(page).toHaveURL('/rebalance');

    // Navigate to Recommendations page
    await page.getByRole('link', { name: 'Recommendations' }).click();
    await expect(page).toHaveURL('/recommendations');

    // Navigate back to Dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
  });

  test('highlights active page in navigation', async ({ page }) => {
    await page.goto('/');

    // Dashboard link should be active (have blue border)
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    await expect(dashboardLink).toHaveClass(/border-blue-500/);

    // Navigate to Funds
    await page.getByRole('link', { name: 'Funds' }).click();
    const fundsLink = page.getByRole('link', { name: 'Funds' });
    await expect(fundsLink).toHaveClass(/border-blue-500/);
  });
});

