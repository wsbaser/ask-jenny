/**
 * Login View Server Error & Troubleshooting E2E Tests
 *
 * Tests for the server error troubleshooting UI in the login view.
 * These tests verify that users receive helpful guidance when the server is unavailable.
 *
 * Note: These tests intentionally do not start a backend server to test
 * the server error state and troubleshooting UI.
 */

import { test, expect } from '@playwright/test';
import { SERVER_PORT, STATIC_PORT } from '@automaker/types';

test.describe('Login View - Server Error Troubleshooting', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the login page without a running backend server
    // This will trigger the server connection error flow
    // We use a short timeout since we expect the connection to fail
    await page.goto('/login', { timeout: 5000 }).catch(() => {
      // Expected to potentially timeout/fail without server
    });
  });

  test('should display server unavailable message when backend is not running', async ({
    page,
  }) => {
    // Wait for the server error state to appear (after retries)
    // The login view has a MAX_RETRIES of 5 with exponential backoff
    await expect(page.getByRole('heading', { name: 'Server Unavailable' })).toBeVisible({
      timeout: 30000,
    });

    // Verify the error message is displayed
    await expect(page.getByRole('alert')).toContainText('Unable to connect to server');
  });

  test('should display the troubleshooting section with correct content', async ({ page }) => {
    // Wait for server error state
    await expect(page.getByRole('heading', { name: 'Server Unavailable' })).toBeVisible({
      timeout: 30000,
    });

    // Verify troubleshooting section is visible
    await expect(page.getByText('Troubleshooting steps:')).toBeVisible();

    // Verify all 4 troubleshooting steps are present
    await expect(page.getByText('Check that the server is running')).toBeVisible();
    await expect(page.getByText(/Verify the server is accessible at:/)).toBeVisible();
    await expect(page.getByText('Check for firewall or network issues')).toBeVisible();
    await expect(page.getByText('Try restarting the server with')).toBeVisible();

    // Verify the npm command is shown
    await expect(page.getByText('npm run dev')).toBeVisible();
  });

  test('should display the correct server URL in troubleshooting', async ({ page }) => {
    // Wait for server error state
    await expect(page.getByRole('heading', { name: 'Server Unavailable' })).toBeVisible({
      timeout: 30000,
    });

    // Verify the server URL includes the correct port
    const expectedUrl = `http://localhost:${SERVER_PORT}`;
    await expect(page.getByText(expectedUrl)).toBeVisible();
  });

  test('should have a retry button that attempts reconnection', async ({ page }) => {
    // Wait for server error state
    await expect(page.getByRole('heading', { name: 'Server Unavailable' })).toBeVisible({
      timeout: 30000,
    });

    // Verify the retry button is visible
    const retryButton = page.getByRole('button', { name: 'Retry Connection' });
    await expect(retryButton).toBeVisible();
    await expect(retryButton).toBeEnabled();

    // Click retry - should show "Connecting to server" while retrying
    await retryButton.click();

    // Should show connecting state again
    await expect(page.getByText(/Connecting to server/)).toBeVisible({ timeout: 5000 });
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    // Wait for server error state
    await expect(page.getByRole('heading', { name: 'Server Unavailable' })).toBeVisible({
      timeout: 30000,
    });

    // Verify the error message has role="alert" for screen readers
    const alertElement = page.getByRole('alert');
    await expect(alertElement).toBeVisible();

    // Verify the ServerCrash icon has aria-hidden
    const serverCrashIcon = page.locator('svg').first();
    await expect(serverCrashIcon).toHaveAttribute('aria-hidden', 'true');

    // Verify the refresh icon on button has aria-hidden
    const retryButton = page.getByRole('button', { name: 'Retry Connection' });
    const refreshIcon = retryButton.locator('svg');
    await expect(refreshIcon).toHaveAttribute('aria-hidden', 'true');
  });
});

test.describe('Login View - Port Configuration', () => {
  test('port constants should have expected values', () => {
    // Verify the centralized port constants have the expected values
    expect(SERVER_PORT).toBe(7008);
    expect(STATIC_PORT).toBe(7007);
  });

  test('ports should be sequential (UI port + 1 = Server port)', () => {
    expect(SERVER_PORT).toBe(STATIC_PORT + 1);
  });
});

test.describe('Login View - Connecting State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login', { timeout: 5000 }).catch(() => {
      // Expected to potentially timeout/fail without server
    });
  });

  test('should show connecting state with attempt counter during retries', async ({ page }) => {
    // The initial state should show "Connecting to server..."
    await expect(page.getByText('Connecting to server...')).toBeVisible({ timeout: 5000 });

    // After first retry fails, should show attempt count
    await expect(page.getByText(/Connecting to server \(attempt 2/)).toBeVisible({
      timeout: 15000,
    });
  });

  test('should have proper accessibility on loading states', async ({ page }) => {
    // Check that loading state has proper accessibility attributes
    const loadingContainer = page.locator('[role="status"]');
    await expect(loadingContainer).toBeVisible({ timeout: 5000 });

    // Verify aria-live is set for screen reader updates
    await expect(loadingContainer).toHaveAttribute('aria-live', 'polite');
  });
});
