import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route('**/api/tastytrade/balance', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            netLiquidity: 100000,
            totalEquity: 105000,
            cashAvailableForTrading: 5000,
            buyingPower: 20000,
          },
        }),
      });
    });

    await page.route('**/api/tastytrade/positions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              symbol: 'AAPL',
              quantity: 100,
              markPrice: 150,
              instrumentType: 'Equity',
            },
            {
              symbol: 'MSFT',
              quantity: 50,
              markPrice: 300,
              instrumentType: 'Stock',
            },
          ],
        }),
      });
    });
  });

  test('displays account overview with balance information', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads
    await expect(page.getByRole('heading', { name: /Account Overview/i })).toBeVisible();

    // Check balance cards
    await expect(page.getByText('Net Liquidity')).toBeVisible();
    await expect(page.getByText('$100,000.00')).toBeVisible();
    await expect(page.getByText('Total Equity')).toBeVisible();
    await expect(page.getByText('Cash Available')).toBeVisible();
    await expect(page.getByText('Buying Power')).toBeVisible();
  });

  test('displays current positions table', async ({ page }) => {
    await page.goto('/');

    // Wait for positions to load
    await expect(page.getByRole('heading', { name: /Current Positions/i })).toBeVisible();

    // Check table headers
    await expect(page.getByRole('columnheader', { name: 'Symbol' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Shares' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Price' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Value' })).toBeVisible();

    // Check position data
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByText('MSFT')).toBeVisible();
    await expect(page.getByText('100')).toBeVisible();
    await expect(page.getByText('50')).toBeVisible();
  });

  test('shows loading state initially', async ({ page }) => {
    // Delay the API response to see loading state
    await page.route('**/api/tastytrade/balance', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            netLiquidity: 100000,
            totalEquity: 105000,
            cashAvailableForTrading: 5000,
            buyingPower: 20000,
          },
        }),
      });
    });

    await page.goto('/');

    // Should show loading state briefly
    await expect(page.getByText(/Loading account data/i)).toBeVisible({ timeout: 2000 });
  });

  test('handles error state and allows retry', async ({ page }) => {
    // Mock API to return error
    await page.route('**/api/tastytrade/balance', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch account balance',
        }),
      });
    });

    await page.goto('/');

    // Should show error message
    await expect(page.getByText(/Error:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();

    // Mock successful response for retry
    await page.route('**/api/tastytrade/balance', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            netLiquidity: 100000,
            totalEquity: 105000,
            cashAvailableForTrading: 5000,
            buyingPower: 20000,
          },
        }),
      });
    });

    // Click retry button
    await page.getByRole('button', { name: /Retry/i }).click();

    // Should now show the balance
    await expect(page.getByText('Net Liquidity')).toBeVisible();
  });
});

