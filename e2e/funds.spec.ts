import { test, expect } from '@playwright/test';

test.describe('Funds Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API response for funds list
    await page.route('**/api/funds', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: '1',
                cik: '0001067983',
                name: 'Berkshire Hathaway',
                enabled: true,
                holdings: [
                  {
                    ticker: 'AAPL',
                    shares: 1000000,
                    value: 150000000,
                    weight: 45.5,
                  },
                  {
                    ticker: 'MSFT',
                    shares: 500000,
                    value: 150000000,
                    weight: 45.5,
                  },
                ],
              },
            ],
          }),
        });
      }
    });
  });

  test('displays funds list', async ({ page }) => {
    await page.goto('/funds');

    // Check page title
    await expect(page.getByRole('heading', { name: /Followed Funds/i })).toBeVisible();

    // Check fund information
    await expect(page.getByText('Berkshire Hathaway')).toBeVisible();
    await expect(page.getByText(/CIK: 0001067983/i)).toBeVisible();
    await expect(page.getByText('Enabled')).toBeVisible();
  });

  test('displays fund holdings', async ({ page }) => {
    await page.goto('/funds');

    // Check holdings table
    await expect(page.getByText('Top Holdings')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Ticker' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Shares' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Value' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Weight' })).toBeVisible();

    // Check holdings data
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByText('MSFT')).toBeVisible();
  });

  test('syncs funds when sync button is clicked', async ({ page }) => {
    let syncCalled = false;

    await page.route('**/api/funds', async (route) => {
      if (route.request().method() === 'PUT') {
        syncCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { synced: 1 },
          }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: '1',
                cik: '0001067983',
                name: 'Berkshire Hathaway',
                enabled: true,
                holdings: [],
              },
            ],
          }),
        });
      }
    });

    await page.goto('/funds');

    // Click sync button
    await page.getByRole('button', { name: /Sync Funds/i }).click();

    // Wait for sync to complete
    await expect(page.getByRole('button', { name: /Sync Funds/i })).toBeEnabled();

    expect(syncCalled).toBe(true);
  });

  test('shows empty state when no funds are configured', async ({ page }) => {
    await page.route('**/api/funds', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    await page.goto('/funds');

    await expect(page.getByText(/No funds configured/i)).toBeVisible();
  });

  test('shows loading state initially', async ({ page }) => {
    // Delay the API response
    await page.route('**/api/funds', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    await page.goto('/funds');

    // Should show loading state briefly
    await expect(page.getByText(/Loading funds/i)).toBeVisible({ timeout: 2000 });
  });
});

