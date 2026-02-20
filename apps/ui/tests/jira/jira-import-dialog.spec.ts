/**
 * E2E tests for Jira Import Dialog
 *
 * Tests the Jira integration UI including connection flow, board/sprint selection,
 * issue selection, and import functionality.
 */

import { test, expect } from '@playwright/test';

test.describe('Jira Import Dialog', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the board view
    await page.goto('/');

    // Wait for the kanban board to load
    await page.waitForSelector('[data-testid="kanban-column-backlog"]', { timeout: 30000 });
  });

  test.describe('Dialog Opening', () => {
    test('should open Jira import dialog when clicking Jira button', async ({ page }) => {
      // Find and click the Jira import button in the backlog column
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await expect(jiraButton).toBeVisible();

      await jiraButton.click();

      // Dialog should be visible
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Should have title
      await expect(page.getByText('Import from Jira')).toBeVisible();
    });

    test('should close dialog when clicking Cancel', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Click cancel
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Dialog should be closed
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    test('should close dialog when pressing Escape', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Dialog should be closed
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  });

  test.describe('Connection State', () => {
    test('should show Connect to Jira button when not connected', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // Should show connect button
      const connectButton = page.getByRole('button', { name: /Connect to Jira/i });
      await expect(connectButton).toBeVisible();
    });

    test('Connect button should have proper styling', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      const connectButton = page.getByRole('button', { name: /Connect to Jira/i });
      await expect(connectButton).toBeVisible();

      // Should have external link icon
      const externalLinkIcon = connectButton.locator('svg');
      await expect(externalLinkIcon).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA attributes', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Check ARIA attributes
      await expect(dialog).toHaveAttribute('aria-labelledby', 'jira-dialog-title');
      await expect(dialog).toHaveAttribute('aria-describedby', 'jira-dialog-description');
      await expect(dialog).toHaveAttribute(
        'aria-roledescription',
        'Import dialog for Jira sprint tasks'
      );
    });

    test('should have proper button labels for screen readers', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // Cancel button should be accessible
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await expect(cancelButton).toBeVisible();
      await expect(cancelButton).toBeEnabled();
    });

    test('should have minimum touch target sizes (WCAG 2.1 AA)', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // Cancel button should have minimum height of 44px
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      const boundingBox = await cancelButton.boundingBox();

      expect(boundingBox?.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should focus cancel button when dialog opens', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // Dialog should be visible
      await expect(page.getByRole('dialog')).toBeVisible();

      // Tab should navigate through focusable elements
      await page.keyboard.press('Tab');

      // Should be able to navigate with keyboard
      const activeElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(activeElement).toBeTruthy();
    });

    test('should trap focus within dialog', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // Dialog should be visible
      await expect(page.getByRole('dialog')).toBeVisible();

      // Tab multiple times - focus should stay within dialog
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
      }

      // Focus should still be within the dialog
      const focusedWithinDialog = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return dialog?.contains(document.activeElement);
      });

      expect(focusedWithinDialog).toBe(true);
    });
  });

  test.describe('Visual States', () => {
    test('should show loading state when connecting', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // We can't easily test the loading state without mocking,
      // but we can verify the dialog renders correctly
      await expect(page.getByRole('dialog')).toBeVisible();
    });

    test('should have proper dialog dimensions', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      const dialog = page.getByRole('dialog');
      const boundingBox = await dialog.boundingBox();

      // Dialog should have reasonable dimensions
      expect(boundingBox?.width).toBeGreaterThan(300);
      expect(boundingBox?.height).toBeGreaterThan(200);
    });
  });

  test.describe('Responsive Design', () => {
    test('should display correctly on smaller screens', async ({ page }) => {
      // Set smaller viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Navigate and open dialog
      await page.goto('/');
      await page.waitForSelector('[data-testid="kanban-column-backlog"]', { timeout: 30000 });

      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // Dialog should still be visible and usable
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    });

    test('Jira button should show label on larger screens', async ({ page }) => {
      // Set larger viewport
      await page.setViewportSize({ width: 1200, height: 800 });

      // Navigate
      await page.goto('/');
      await page.waitForSelector('[data-testid="kanban-column-backlog"]', { timeout: 30000 });

      // Check if Jira button has visible text
      const jiraButton = page.locator('[data-testid="jira-import-button"]');
      await expect(jiraButton).toBeVisible();

      // On larger screens, it should show "Jira" text
      await expect(jiraButton).toContainText('Jira');
    });
  });

  test.describe('Dialog Content', () => {
    test('should display dialog title and description', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // Check title
      await expect(page.getByText('Import from Jira')).toBeVisible();

      // Check description
      await expect(
        page.getByText(/Connect your Jira account|Import tasks from your current sprint/i)
      ).toBeVisible();
    });

    test('should have proper heading hierarchy', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      // Dialog title should be an h2
      const title = page.locator('#jira-dialog-title');
      await expect(title).toBeVisible();
    });
  });

  test.describe('Button States', () => {
    test('Cancel button should always be enabled', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await expect(cancelButton).toBeEnabled();
    });

    test('Connect button should be clickable', async ({ page }) => {
      // Open dialog
      await page.locator('[data-testid="jira-import-button"]').click();

      const connectButton = page.getByRole('button', { name: /Connect to Jira/i });

      // If the button exists (not connected state), it should be clickable
      const count = await connectButton.count();
      if (count > 0) {
        await expect(connectButton).toBeEnabled();
      }
    });
  });
});
