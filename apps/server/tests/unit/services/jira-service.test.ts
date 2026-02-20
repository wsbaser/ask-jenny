/**
 * Unit tests for JiraService
 *
 * Tests OAuth flow, token management, API interactions, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraService } from '@/services/jira-service.js';
import type { SettingsService } from '@/services/settings-service.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment variables
const originalEnv = process.env;

describe('JiraService', () => {
  let jiraService: JiraService;
  let mockSettingsService: SettingsService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up environment variables
    process.env = {
      ...originalEnv,
      JIRA_CLIENT_ID: 'test-client-id',
      JIRA_CLIENT_SECRET: 'test-client-secret',
      JIRA_REDIRECT_URI: 'http://localhost:3008/api/jira/callback',
    };

    // Create mock settings service
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

  describe('constructor and destroy', () => {
    it('should create service successfully', () => {
      expect(jiraService).toBeInstanceOf(JiraService);
    });

    it('should clean up interval on destroy', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      jiraService.destroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('isConfigured', () => {
    it('should return true when client ID and secret are set', () => {
      expect(jiraService.isConfigured()).toBe(true);
    });

    it('should return false when client ID is missing', () => {
      process.env.JIRA_CLIENT_ID = '';
      const service = new JiraService(mockSettingsService);
      expect(service.isConfigured()).toBe(false);
      service.destroy();
    });

    it('should return false when client secret is missing', () => {
      process.env.JIRA_CLIENT_SECRET = '';
      const service = new JiraService(mockSettingsService);
      expect(service.isConfigured()).toBe(false);
      service.destroy();
    });
  });

  describe('initiateOAuth', () => {
    it('should generate authorization URL with correct parameters', async () => {
      const result = await jiraService.initiateOAuth('http://localhost:3007/board');

      expect(result.authorizationUrl).toContain('https://auth.atlassian.com/authorize');
      expect(result.authorizationUrl).toContain('client_id=test-client-id');
      expect(result.authorizationUrl).toContain('redirect_uri=');
      expect(result.authorizationUrl).toContain('scope=');
      expect(result.authorizationUrl).toContain('state=');
      expect(result.state).toBeTruthy();
    });

    it('should include required OAuth scopes', async () => {
      const result = await jiraService.initiateOAuth();
      const url = new URL(result.authorizationUrl);
      const scope = url.searchParams.get('scope');

      expect(scope).toContain('read:jira-work');
      expect(scope).toContain('offline_access');
    });

    it('should throw error when not configured', async () => {
      process.env.JIRA_CLIENT_ID = '';
      const service = new JiraService(mockSettingsService);

      await expect(service.initiateOAuth()).rejects.toThrow('Jira OAuth is not configured');

      service.destroy();
    });
  });

  describe('validateOAuthState', () => {
    it('should validate pending state', async () => {
      const { state } = await jiraService.initiateOAuth('http://localhost:3007');
      const result = jiraService.validateOAuthState(state);

      expect(result.valid).toBe(true);
      expect(result.returnUrl).toBe('http://localhost:3007');
    });

    it('should return invalid for unknown state', () => {
      const result = jiraService.validateOAuthState('unknown-state');
      expect(result.valid).toBe(false);
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
        }),
      });

      const result = await jiraService.exchangeCodeForTokens('auth-code');

      expect(result).toEqual({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.atlassian.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );
    });

    it('should throw error on failed exchange', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(jiraService.exchangeCodeForTokens('bad-code')).rejects.toThrow(
        'Failed to exchange code for tokens: 400'
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      const result = await jiraService.refreshAccessToken('old-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      });
    });

    it('should preserve original refresh token if new one not returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
          // No refresh_token in response
        }),
      });

      const result = await jiraService.refreshAccessToken('original-refresh-token');

      expect(result.refreshToken).toBe('original-refresh-token');
    });

    it('should throw error on failed refresh', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(jiraService.refreshAccessToken('invalid-token')).rejects.toThrow(
        'Failed to refresh token: 401'
      );
    });
  });

  describe('getAccessibleResources', () => {
    it('should return accessible Jira sites', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'cloud-id-1',
            name: 'My Jira Site',
            url: 'https://mysite.atlassian.net',
          },
          {
            id: 'cloud-id-2',
            name: 'Another Site',
            url: 'https://another.atlassian.net',
          },
        ],
      });

      const resources = await jiraService.getAccessibleResources('access-token');

      expect(resources).toHaveLength(2);
      expect(resources[0]).toEqual({
        id: 'cloud-id-1',
        name: 'My Jira Site',
        url: 'https://mysite.atlassian.net',
      });
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(jiraService.getAccessibleResources('access-token')).rejects.toThrow(
        'Failed to get accessible resources: 403'
      );
    });
  });

  describe('getConnectionStatus', () => {
    it('should return not connected when no credentials exist', async () => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: {},
      });

      const status = await jiraService.getConnectionStatus();

      expect(status.connected).toBe(false);
      expect(status.configured).toBe(true);
    });

    it('should return connected status when credentials exist', async () => {
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

      const status = await jiraService.getConnectionStatus();

      expect(status.connected).toBe(true);
      expect(status.siteName).toBe('My Site');
      expect(status.siteUrl).toBe('https://mysite.atlassian.net');
    });

    it('should return not configured when OAuth is not set up', async () => {
      process.env.JIRA_CLIENT_ID = '';
      const service = new JiraService(mockSettingsService);

      const status = await service.getConnectionStatus();

      expect(status.configured).toBe(false);
      expect(status.connected).toBe(false);

      service.destroy();
    });
  });

  describe('saveCredentials', () => {
    it('should save credentials with expiry timestamp', async () => {
      await jiraService.saveCredentials(
        'access-token',
        'refresh-token',
        3600,
        'cloud-id',
        'https://mysite.atlassian.net',
        'My Site'
      );

      expect(mockSettingsService.updateCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          jira: expect.objectContaining({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            cloudId: 'cloud-id',
            siteUrl: 'https://mysite.atlassian.net',
            siteName: 'My Site',
          }),
        })
      );

      // Check that expiresAt is set correctly (roughly 1 hour from now)
      const call = vi.mocked(mockSettingsService.updateCredentials).mock.calls[0][0];
      const expiresAt = new Date(call.jira!.expiresAt!);
      const expectedMin = Date.now() + 3500 * 1000; // Allow some margin
      const expectedMax = Date.now() + 3700 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('clearCredentials', () => {
    it('should clear Jira credentials', async () => {
      await jiraService.clearCredentials();

      expect(mockSettingsService.updateCredentials).toHaveBeenCalledWith({
        jira: undefined,
      });
    });
  });

  describe('getBoards', () => {
    beforeEach(() => {
      // Mock credentials with valid token
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

    it('should return boards from Jira API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [
            {
              id: 1,
              name: 'My Scrum Board',
              type: 'scrum',
              location: {
                projectId: 10000,
                projectKey: 'PROJ',
                projectName: 'My Project',
              },
            },
            {
              id: 2,
              name: 'Kanban Board',
              type: 'kanban',
            },
          ],
        }),
      });

      const boards = await jiraService.getBoards();

      expect(boards).toHaveLength(2);
      expect(boards[0]).toEqual({
        id: 1,
        name: 'My Scrum Board',
        type: 'scrum',
        project: {
          id: '10000',
          key: 'PROJ',
          name: 'My Project',
        },
      });
      expect(boards[1]).toEqual({
        id: 2,
        name: 'Kanban Board',
        type: 'kanban',
        project: undefined,
      });
    });

    it('should throw error when not connected', async () => {
      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue({
        version: 1,
        apiKeys: {},
      });

      await expect(jiraService.getBoards()).rejects.toThrow('Not connected to Jira');
    });
  });

  describe('getSprints', () => {
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

    it('should return sprints for a board', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [
            {
              id: 1,
              name: 'Sprint 1',
              state: 'active',
              startDate: '2024-01-01T00:00:00.000Z',
              endDate: '2024-01-14T00:00:00.000Z',
            },
            {
              id: 2,
              name: 'Sprint 2',
              state: 'future',
            },
          ],
        }),
      });

      const sprints = await jiraService.getSprints(1);

      expect(sprints).toHaveLength(2);
      expect(sprints[0]).toEqual({
        id: 1,
        name: 'Sprint 1',
        state: 'active',
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-01-14T00:00:00.000Z',
        boardId: 1,
      });
    });

    it('should filter sprints by state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [{ id: 1, name: 'Sprint 1', state: 'active' }],
        }),
      });

      await jiraService.getSprints(1, 'active');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('state=active'),
        expect.any(Object)
      );
    });
  });

  describe('getSprintIssues', () => {
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

    it('should return issues from a sprint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 2,
          issues: [
            {
              id: '10001',
              key: 'PROJ-1',
              fields: {
                summary: 'Implement feature X',
                description: null,
                status: {
                  id: '1',
                  name: 'To Do',
                  statusCategory: { key: 'new' },
                },
                priority: {
                  id: '2',
                  name: 'High',
                  iconUrl: 'https://example.com/high.png',
                },
                issuetype: {
                  id: '10001',
                  name: 'Story',
                  iconUrl: 'https://example.com/story.png',
                  subtask: false,
                },
                assignee: {
                  accountId: 'user-1',
                  displayName: 'John Doe',
                  emailAddress: 'john@example.com',
                  avatarUrls: { '48x48': 'https://example.com/avatar.png' },
                },
                reporter: null,
                customfield_10016: 5,
                labels: ['frontend'],
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-02T00:00:00.000Z',
              },
            },
          ],
        }),
      });

      const result = await jiraService.getSprintIssues(1);

      expect(result.total).toBe(2);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        id: '10001',
        key: 'PROJ-1',
        summary: 'Implement feature X',
        status: {
          id: '1',
          name: 'To Do',
          statusCategory: 'todo',
        },
        priority: {
          id: '2',
          name: 'High',
        },
        issueType: {
          id: '10001',
          name: 'Story',
          subtask: false,
        },
        assignee: {
          accountId: 'user-1',
          displayName: 'John Doe',
        },
        storyPoints: 5,
        labels: ['frontend'],
        url: 'https://mysite.atlassian.net/browse/PROJ-1',
      });
    });

    it('should filter by status category', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total: 0, issues: [] }),
      });

      await jiraService.getSprintIssues(1, 'todo');

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('jql='), expect.any(Object));
    });
  });

  describe('getSprintIssuesForProject', () => {
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

    it('should find active sprint and return issues when boardId provided', async () => {
      // Mock getSprints
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [{ id: 10, name: 'Sprint 10', state: 'active' }],
        }),
      });

      // Mock getSprintIssues
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 1,
          issues: [
            {
              id: '10001',
              key: 'PROJ-1',
              fields: {
                summary: 'Test issue',
                description: null,
                status: { id: '1', name: 'To Do', statusCategory: { key: 'new' } },
                issuetype: { id: '1', name: 'Task', subtask: false },
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-02T00:00:00.000Z',
              },
            },
          ],
        }),
      });

      const result = await jiraService.getSprintIssuesForProject({ boardId: 1 });

      expect(result.sprint).toEqual({
        id: 10,
        name: 'Sprint 10',
        state: 'active',
        boardId: 1,
      });
      expect(result.issues).toHaveLength(1);
    });

    it('should return empty when no active sprint found', async () => {
      // Mock getSprints with no active sprint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [{ id: 9, name: 'Sprint 9', state: 'closed' }],
        }),
      });

      const result = await jiraService.getSprintIssuesForProject({ boardId: 1 });

      expect(result.sprint).toBeUndefined();
      expect(result.issues).toEqual([]);
    });
  });

  describe('token refresh', () => {
    it('should auto-refresh expired token when making API calls', async () => {
      // Set up credentials with expired token
      const expiredCredentials = {
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
      };

      vi.mocked(mockSettingsService.getCredentials).mockResolvedValue(expiredCredentials);

      // Mock refresh token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      // Mock boards API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [{ id: 1, name: 'Board 1', type: 'scrum' }],
        }),
      });

      // This should trigger token refresh and then make the API call
      const boards = await jiraService.getBoards();

      expect(boards).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockSettingsService.updateCredentials).toHaveBeenCalled();
    });
  });

  describe('mapStatusCategory', () => {
    it('should map status category keys correctly', async () => {
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

      // Test various status categories
      const testCases = [
        { input: 'new', expected: 'todo' },
        { input: 'undefined', expected: 'todo' },
        { input: 'done', expected: 'done' },
        { input: 'indeterminate', expected: 'indeterminate' },
      ];

      for (const testCase of testCases) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            total: 1,
            issues: [
              {
                id: '1',
                key: 'TEST-1',
                fields: {
                  summary: 'Test',
                  description: null,
                  status: {
                    id: '1',
                    name: 'Test Status',
                    statusCategory: { key: testCase.input },
                  },
                  issuetype: { id: '1', name: 'Task', subtask: false },
                  created: '2024-01-01T00:00:00.000Z',
                  updated: '2024-01-01T00:00:00.000Z',
                },
              },
            ],
          }),
        });

        const result = await jiraService.getSprintIssues(1);
        expect(result.issues[0].status.statusCategory).toBe(testCase.expected);
      }
    });
  });
});
