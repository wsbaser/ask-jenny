/**
 * E2E tests for port configuration consistency
 *
 * These tests verify that the UI correctly uses the centralized port constants
 * from @automaker/types and that the server is accessible on the expected port.
 */

import { test, expect } from '@playwright/test';
import { SERVER_PORT, STATIC_PORT } from '@automaker/types';
import { API_BASE_URL } from '../utils/core/constants';

test.describe('Port Configuration', () => {
  test.describe('Server Port Configuration', () => {
    test('should have server accessible on SERVER_PORT (7008)', async ({ request }) => {
      // Verify the server is accessible on the expected port
      const response = await request.get(`http://localhost:${SERVER_PORT}/api/health`);

      expect(response.ok()).toBe(true);
      expect(SERVER_PORT).toBe(7008);
    });

    test('should have API_BASE_URL using SERVER_PORT', async () => {
      // Verify the test constants are correctly configured
      expect(API_BASE_URL).toBe(`http://localhost:${SERVER_PORT}`);
      expect(API_BASE_URL).toBe('http://localhost:7008');
    });

    test('should respond to health check endpoint', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/api/health`);

      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status');
    });
  });

  test.describe('UI Port Configuration', () => {
    test('should have STATIC_PORT configured correctly (7007)', async () => {
      // Verify the UI port constant is correct
      expect(STATIC_PORT).toBe(7007);
    });

    test('should have consecutive ports (UI + 1 = Server)', async () => {
      // Verify the port convention is maintained
      expect(SERVER_PORT).toBe(STATIC_PORT + 1);
    });
  });

  test.describe('Cross-Origin Port Communication', () => {
    test('should allow UI to make API requests to server port', async ({ page, request }) => {
      // First verify the UI is loaded
      await page.goto('/');

      // Then verify we can make API requests
      const response = await request.get(`${API_BASE_URL}/api/health`);
      expect(response.ok()).toBe(true);
    });
  });
});
