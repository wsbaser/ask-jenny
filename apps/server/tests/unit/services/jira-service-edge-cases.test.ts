/**
 * Edge case tests for JiraService
 *
 * Tests error recovery, concurrent operations, and edge scenarios
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraService } from '@/services/jira-service.js';
import type { SettingsService } from '@/services/settings-service.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment variables
const originalEnv = process.env;

describe('JiraService Edge Cases', () => {
  let jiraService: JiraService;
  let mockSettingsService: SettingsService;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      JIRA_CLIENT_ID: 'test-client-id',
      JIRA_CLIENT_SECRET: 'test-client-secret',
      JIRA_REDIRECT_URI: 'http://localhost:3008/api/jira/callback',
    };

    mockSettingsService = {
      getCredentials: vi.fn().mockResolvedValue({
        version: 1,
        apiKeys: {},
      }),
      updateCredentials: vi.fn().mockImplementation(async (updates) => ({
        version: 1,
        apiKeys: {},
        ...updates,
      })),
    } as any;

    jiraService = new JiraService(mockSettingsService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jiraService.destroy();
  });

  describe('OAuth state management', () => {
    it('should handle expired OAuth state', async () => {
      const { state } = await jiraService.initiateOAuth();

      // Wait for state to potentially expire (in real implementation this would be longer)
      // For testing, we just verify that a different state returns invalid
      const result = jiraService.validateOAuthState('completely-different-state');
      expect(result.valid).toBe(false);
    });

    it('should prevent state reuse', async () => {
      const { state } = await jiraService.initiateOAuth('http://localhost:3007');

      // First validation should succeed
      const result1 = jiraService.validateOAuthState(state);
      expect(result1.valid).toBe(true);

      // Second validation of same state should fail (state consumed)
      const result2 = jiraService.validateOAuthState(state);
      expect(result2.valid).toBe(false);
    });

    it('should handle concurrent OAuth initiations', async () => {
      const [result1, result2] = await Promise.all([
        jiraService.initiateOAuth('http://localhost:3007/board1'),
        jiraService.initiateOAuth('http://localhost:3007/board2'),
      ]);

      expect(result1.state).not.toBe(result2.state);

      const validation1 = jiraService.validateOAuthState(result1.state);
      const validation2 = jiraService.validateOAuthState(result2.state);

      expect(validation1.valid).toBe(true);
      expect(validation2.valid).toBe(true);
      expect(validation1.returnUrl).toBe('http://localhost:3007/board1');
      expect(validation2.returnUrl).toBe('http://localhost:3007/board2');
    });
  });

  describe('token refresh edge cases', () => {
    it('should disconnect when refresh token is invalid', async () => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: {},
        jira: {
          accessToken: 'old-access-token',
          refreshToken: 'invalid-refresh-token',
          expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
          cloudId: 'cloud-id',
          siteUrl: 'https://mysite.atlassian.net',
          siteName: 'My Site',
        },
      });

      // Mock refresh token failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400, // Invalid refresh token
      });

      // Attempting to get boards should trigger refresh and then fail
      await expect(jiraService.getBoards()).rejects.toThrow('Failed to refresh token');

      // Should have cleared credentials
      expect(mockSettingsService.updateCredentials).toHaveBeenCalledWith({
        jira: undefined,
      });
    });

    it('should handle concurrent API calls with expired token', async () => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: {},
        jira: {
          accessToken: 'old-access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
          cloudId: 'cloud-id',
          siteUrl: 'https://mysite.atlassian.net',
          siteName: 'My Site',
        },
      });

      // Mock successful token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      // Mock two boards API calls
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ values: [{ id: 1, name: 'Board', type: 'scrum' }] }),
      });

      // Make concurrent calls
      const [boards1, boards2] = await Promise.all([
        jiraService.getBoards(),
        jiraService.getBoards(),
      ]);

      // Both should succeed
      expect(boards1).toHaveLength(1);
      expect(boards2).toHaveLength(1);
    });

    it('should handle network timeout during token refresh', async () => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: {},
        jira: {
          accessToken: 'old-access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() - 1000).toISOString(),
          cloudId: 'cloud-id',
          siteUrl: 'https://mysite.atlassian.net',
          siteName: 'My Site',
        },
      });

      // Mock network timeout
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(jiraService.getBoards()).rejects.toThrow('Network timeout');
    });
  });

  describe('API error handling', () => {
    beforeEach(() => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: {},
        jira: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          cloudId: 'cloud-id',
          siteUrl: 'https://mysite.atlassian.net',
          siteName: 'My Site',
        },
      });
    });

    it('should handle rate limiting (429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(jiraService.getBoards()).rejects.toThrow('429');
    });

    it('should handle server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(jiraService.getBoards()).rejects.toThrow('500');
    });

    it('should handle malformed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(jiraService.getBoards()).rejects.toThrow();
    });

    it('should handle empty response from boards API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: [] }),
      });

      const boards = await jiraService.getBoards();
      expect(boards).toEqual([]);
    });

    it('should handle missing fields in issue response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 1,
          issues: [
            {
              id: '1',
              key: 'PROJ-1',
              fields: {
                summary: 'Minimal issue',
                // Missing: description, status, priority, issuetype, assignee, etc.
                status: { id: '1', name: 'Open' }, // Missing statusCategory
                issuetype: { id: '1', name: 'Task' }, // Missing subtask
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-01T00:00:00.000Z',
              },
            },
          ],
        }),
      });

      const result = await jiraService.getSprintIssues(1);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].summary).toBe('Minimal issue');
      // Should have defaults for missing fields
      expect(result.issues[0].status.statusCategory).toBe('todo');
      expect(result.issues[0].issueType.subtask).toBe(false);
    });
  });

  describe('disconnection scenarios', () => {
    it('should clear all Jira-related data on disconnect', async () => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: { anthropic: 'key' },
        jira: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date().toISOString(),
          cloudId: 'cloud-id',
          siteUrl: 'https://mysite.atlassian.net',
          siteName: 'My Site',
        },
      });

      await jiraService.clearCredentials();

      expect(mockSettingsService.updateCredentials).toHaveBeenCalledWith({
        jira: undefined,
      });
    });

    it('should report not connected after clearCredentials', async () => {
      // Initially connected
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValueOnce({
        version: 1,
        apiKeys: {},
        jira: {
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          cloudId: 'cloud',
          siteUrl: 'https://site.atlassian.net',
          siteName: 'Site',
        },
      });

      let status = await jiraService.getConnectionStatus();
      expect(status.connected).toBe(true);

      // After clearing
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValueOnce({
        version: 1,
        apiKeys: {},
      });

      await jiraService.clearCredentials();
      status = await jiraService.getConnectionStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('sprint issues filtering', () => {
    beforeEach(() => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: {},
        jira: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          cloudId: 'cloud-id',
          siteUrl: 'https://mysite.atlassian.net',
          siteName: 'My Site',
        },
      });
    });

    it('should filter issues by todo status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 1,
          issues: [
            {
              id: '1',
              key: 'PROJ-1',
              fields: {
                summary: 'Todo task',
                status: { id: '1', name: 'To Do', statusCategory: { key: 'new' } },
                issuetype: { id: '1', name: 'Task', subtask: false },
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-01T00:00:00.000Z',
              },
            },
          ],
        }),
      });

      const result = await jiraService.getSprintIssues(1, 'todo');

      // Should have applied JQL filter
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('jql='), expect.any(Object));
    });

    it('should handle done status filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 0,
          issues: [],
        }),
      });

      await jiraService.getSprintIssues(1, 'done');

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('jql='), expect.any(Object));
    });
  });

  describe('accessible resources edge cases', () => {
    it('should handle multiple Jira sites', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'cloud-1', name: 'Site 1', url: 'https://site1.atlassian.net' },
          { id: 'cloud-2', name: 'Site 2', url: 'https://site2.atlassian.net' },
          { id: 'cloud-3', name: 'Site 3', url: 'https://site3.atlassian.net' },
        ],
      });

      const resources = await jiraService.getAccessibleResources('token');

      expect(resources).toHaveLength(3);
      // Should return all sites for user to choose
    });

    it('should handle empty accessible resources', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const resources = await jiraService.getAccessibleResources('token');

      expect(resources).toEqual([]);
    });
  });

  describe('sprints pagination', () => {
    beforeEach(() => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: {},
        jira: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          cloudId: 'cloud-id',
          siteUrl: 'https://mysite.atlassian.net',
          siteName: 'My Site',
        },
      });
    });

    it('should return empty sprints array for board with no sprints', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: [] }),
      });

      const sprints = await jiraService.getSprints(1);

      expect(sprints).toEqual([]);
    });

    it('should handle board with all closed sprints', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [
            { id: 1, name: 'Sprint 1', state: 'closed' },
            { id: 2, name: 'Sprint 2', state: 'closed' },
          ],
        }),
      });

      const sprints = await jiraService.getSprints(1);

      expect(sprints).toHaveLength(2);
      expect(sprints.every((s) => s.state === 'closed')).toBe(true);
    });
  });
});
