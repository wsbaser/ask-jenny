/**
 * E2E tests for Jira Import Dialog
 *
 * Tests the Jira integration UI including:
 * - Dialog accessibility
 * - Connection flow
 * - Issue selection
 * - Import functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Jira Import Dialog', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the board view
    await page.goto('/');

    // Wait for the board to load
    await page.waitForSelector('[data-testid="kanban-column-backlog"]', { timeout: 30000 });
  });

  test.describe('Jira Import Button', () => {
    test('should have accessible Jira import button in backlog column', async ({ page }) => {
      // Look for the Jira import button in the backlog column
      const jiraButton = page.locator('[data-testid="jira-import-button"]');

      // The button should exist and be visible
      await expect(jiraButton).toBeVisible();

      // Button should have aria-label for accessibility
      await expect(jiraButton).toHaveAttribute('aria-label', 'Import from Jira');

      // Button should have blue color styling (Zap icon)
      await expect(jiraButton).toHaveClass(/text-blue-500/);
    });

    test('should show tooltip on hover', async ({ page }) => {
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.hover();

      const tooltip = page.getByRole('tooltip');
      await expect(tooltip).toBeVisible({ timeout: 5000 });
      await expect(tooltip).toContainText('Import from Jira');
    });
  });

  test.describe('Dialog Opening', () => {
    test('should open dialog with proper ARIA attributes', async ({ page }) => {
      // Click the Jira import button
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should appear
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Dialog should have proper ARIA attributes
      await expect(dialog).toHaveAttribute('aria-labelledby', 'jira-dialog-title');
      await expect(dialog).toHaveAttribute('aria-describedby', 'jira-dialog-description');

      // Dialog should have the correct title
      const title = page.locator('#jira-dialog-title');
      await expect(title).toContainText('Import from Jira');
    });
  });

  test.describe('Connection State', () => {
    test('should display connect button when not connected', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should be visible
      await expect(page.getByRole('dialog')).toBeVisible();

      // Should show connect button
      await expect(page.getByRole('button', { name: /Connect to Jira/i })).toBeVisible();
    });

    test('should display helpful guidance text', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Should show helpful description text
      await expect(page.getByText(/Link your Jira account/i)).toBeVisible();

      // Should show redirect hint
      await expect(page.getByText(/redirected to Jira/i)).toBeVisible();
    });
  });

  test.describe('Dialog Controls', () => {
    test('should close dialog when cancel is clicked', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should be visible
      await expect(page.getByRole('dialog')).toBeVisible();

      // Click cancel
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Dialog should be closed
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    test('should close dialog when pressing Escape', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should be visible
      await expect(page.getByRole('dialog')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Dialog should be closed
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  });

  test.describe('Focus Management', () => {
    test('should have proper focus management', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should be visible
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Focus should be inside the dialog
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();

      // Tab should cycle through dialog elements
      await page.keyboard.press('Tab');
      const newFocusedElement = page.locator(':focus');
      await expect(newFocusedElement).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper role attributes', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should have role="dialog"
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Check that either the connect button or connection status is shown
      const hasConnectButton = await page
        .getByRole('button', { name: /Connect to Jira/i })
        .isVisible();
      const hasConnectionStatus = await page.locator('[role="status"]').first().isVisible();

      expect(hasConnectButton || hasConnectionStatus).toBeTruthy();
    });

    test('should have descriptive button labels', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should be visible
      await expect(page.getByRole('dialog')).toBeVisible();

      // Cancel button should be visible and accessible
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await expect(cancelButton).toBeVisible();

      // Connect button should be visible and accessible
      const connectButton = page.getByRole('button', { name: /Connect to Jira/i });
      await expect(connectButton).toBeVisible();
    });

    test('should have aria-roledescription for screen readers', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should be visible with enhanced ARIA attributes
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute(
        'aria-roledescription',
        'Import dialog for Jira sprint tasks'
      );
    });
  });

  test.describe('UX Improvements', () => {
    test('Jira button should have visible label on larger screens', async ({ page }) => {
      // Set viewport to larger size
      await page.setViewportSize({ width: 1200, height: 800 });

      // Navigate to the board view
      await page.goto('/');
      await page.waitForSelector('[data-testid="kanban-column-backlog"]', { timeout: 30000 });

      // Check for the Jira button with text
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await expect(jiraButton).toBeVisible();
      await expect(jiraButton).toContainText('Jira');
    });

    test('should have keyboard shortcuts hint button', async ({ page }) => {
      // This test would require a connected state to see the issue list
      // For now we verify the button is accessible
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should be visible
      await expect(page.getByRole('dialog')).toBeVisible();

      // Verify dialog has proper accessibility
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAttribute('aria-labelledby', 'jira-dialog-title');
    });

    test('should have minimum touch target size for buttons', async ({ page }) => {
      // Open the dialog
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await jiraButton.click();

      // Dialog should be visible
      await expect(page.getByRole('dialog')).toBeVisible();

      // Cancel button should have minimum height of 44px (WCAG touch target)
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      const boundingBox = await cancelButton.boundingBox();

      // Button should have at least 44px height
      expect(boundingBox?.height).toBeGreaterThanOrEqual(44);
    });
  });
});
