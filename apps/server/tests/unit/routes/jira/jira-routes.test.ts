/**
 * Unit tests for Jira route handlers
 *
 * Tests connection status, OAuth flow, boards, sprints, and issues endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createConnectionStatusHandler } from '@/routes/jira/routes/connection-status.js';
import { createConnectHandler } from '@/routes/jira/routes/connect.js';
import { createCallbackHandler } from '@/routes/jira/routes/callback.js';
import { createDisconnectHandler } from '@/routes/jira/routes/disconnect.js';
import { createBoardsHandler } from '@/routes/jira/routes/boards.js';
import { createSprintsHandler } from '@/routes/jira/routes/sprints.js';
import { createSprintIssuesHandler } from '@/routes/jira/routes/sprint-issues.js';
import type { JiraService } from '@/services/jira-service.js';
import { createMockExpressContext } from '../../utils/mocks.js';

describe('Jira route handlers', () => {
  let mockJiraService: JiraService;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJiraService = {
      isConfigured: vi.fn().mockReturnValue(true),
      getConnectionStatus: vi.fn(),
      initiateOAuth: vi.fn(),
      validateOAuthState: vi.fn(),
      exchangeCodeForTokens: vi.fn(),
      getAccessibleResources: vi.fn(),
      saveCredentials: vi.fn(),
      clearCredentials: vi.fn(),
      getBoards: vi.fn(),
      getSprints: vi.fn(),
      getSprintIssuesForProject: vi.fn(),
    } as any;

    const context = createMockExpressContext();
    req = context.req;
    res = context.res;

    // Add redirect mock for OAuth flow
    (res as any).redirect = vi.fn();
  });

  describe('connection-status handler', () => {
    it('should return connection status', async () => {
      vi.mocked(mockJiraService.getConnectionStatus).mockResolvedValue({
        configured: true,
        connected: true,
        siteName: 'My Jira Site',
        siteUrl: 'https://mysite.atlassian.net',
      });

      const handler = createConnectionStatusHandler(mockJiraService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        configured: true,
        connected: true,
        siteName: 'My Jira Site',
        siteUrl: 'https://mysite.atlassian.net',
      });
    });

    it('should return not configured status', async () => {
      vi.mocked(mockJiraService.getConnectionStatus).mockResolvedValue({
        configured: false,
        connected: false,
      });

      const handler = createConnectionStatusHandler(mockJiraService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        configured: false,
        connected: false,
      });
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockJiraService.getConnectionStatus).mockRejectedValue(
        new Error('Settings read failed')
      );

      const handler = createConnectionStatusHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Settings read failed' });
    });
  });

  describe('connect handler', () => {
    it('should return authorization URL', async () => {
      vi.mocked(mockJiraService.initiateOAuth).mockResolvedValue({
        authorizationUrl: 'https://auth.atlassian.com/authorize?...',
        state: 'random-state-123',
      });

      req.body = { returnUrl: 'http://localhost:3007/board' };

      const handler = createConnectHandler(mockJiraService);
      await handler(req, res);

      expect(mockJiraService.initiateOAuth).toHaveBeenCalledWith('http://localhost:3007/board');
      expect(res.json).toHaveBeenCalledWith({
        authorizationUrl: 'https://auth.atlassian.com/authorize?...',
      });
    });

    it('should work without returnUrl', async () => {
      vi.mocked(mockJiraService.initiateOAuth).mockResolvedValue({
        authorizationUrl: 'https://auth.atlassian.com/authorize?...',
        state: 'random-state-123',
      });

      req.body = {};

      const handler = createConnectHandler(mockJiraService);
      await handler(req, res);

      expect(mockJiraService.initiateOAuth).toHaveBeenCalledWith(undefined);
    });

    it('should handle not configured error', async () => {
      vi.mocked(mockJiraService.initiateOAuth).mockRejectedValue(
        new Error('Jira OAuth is not configured')
      );

      const handler = createConnectHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Jira integration is not configured. Set JIRA_CLIENT_ID and JIRA_CLIENT_SECRET.',
      });
    });

    it('should handle general errors', async () => {
      vi.mocked(mockJiraService.initiateOAuth).mockRejectedValue(new Error('Network error'));

      const handler = createConnectHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Network error' });
    });
  });

  describe('callback handler', () => {
    it('should handle successful OAuth callback', async () => {
      req.query = {
        code: 'auth-code-123',
        state: 'state-123',
      };

      vi.mocked(mockJiraService.validateOAuthState).mockReturnValue({
        valid: true,
        returnUrl: 'http://localhost:3007/board',
      });

      vi.mocked(mockJiraService.exchangeCodeForTokens).mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      });

      vi.mocked(mockJiraService.getAccessibleResources).mockResolvedValue([
        {
          id: 'cloud-id-1',
          name: 'My Jira Site',
          url: 'https://mysite.atlassian.net',
        },
      ]);

      const handler = createCallbackHandler(mockJiraService);
      await handler(req, res);

      expect(mockJiraService.saveCredentials).toHaveBeenCalledWith(
        'access-token',
        'refresh-token',
        3600,
        'cloud-id-1',
        'https://mysite.atlassian.net',
        'My Jira Site'
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3007/board')
      );
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('jiraConnected=true'));
    });

    it('should handle missing code parameter', async () => {
      req.query = { state: 'state-123' };

      const handler = createCallbackHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing authorization code',
      });
    });

    it('should handle missing state parameter', async () => {
      req.query = { code: 'auth-code-123' };

      const handler = createCallbackHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing state parameter',
      });
    });

    it('should handle invalid state', async () => {
      req.query = {
        code: 'auth-code-123',
        state: 'invalid-state',
      };

      vi.mocked(mockJiraService.validateOAuthState).mockReturnValue({
        valid: false,
      });

      const handler = createCallbackHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired state parameter',
      });
    });

    it('should handle OAuth error from Jira', async () => {
      req.query = {
        error: 'access_denied',
        error_description: 'User denied access',
        state: 'state-123',
      };

      vi.mocked(mockJiraService.validateOAuthState).mockReturnValue({
        valid: true,
        returnUrl: 'http://localhost:3007/board',
      });

      const handler = createCallbackHandler(mockJiraService);
      await handler(req, res);

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('jiraError='));
    });

    it('should handle no accessible resources', async () => {
      req.query = {
        code: 'auth-code-123',
        state: 'state-123',
      };

      vi.mocked(mockJiraService.validateOAuthState).mockReturnValue({
        valid: true,
      });

      vi.mocked(mockJiraService.exchangeCodeForTokens).mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      });

      vi.mocked(mockJiraService.getAccessibleResources).mockResolvedValue([]);

      const handler = createCallbackHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No accessible Jira sites found',
      });
    });

    it('should handle token exchange failure', async () => {
      req.query = {
        code: 'bad-code',
        state: 'state-123',
      };

      vi.mocked(mockJiraService.validateOAuthState).mockReturnValue({
        valid: true,
        returnUrl: 'http://localhost:3007',
      });

      vi.mocked(mockJiraService.exchangeCodeForTokens).mockRejectedValue(
        new Error('Token exchange failed')
      );

      const handler = createCallbackHandler(mockJiraService);
      await handler(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('jiraError=Token%20exchange%20failed')
      );
    });
  });

  describe('disconnect handler', () => {
    it('should clear credentials successfully', async () => {
      vi.mocked(mockJiraService.clearCredentials).mockResolvedValue(undefined);

      const handler = createDisconnectHandler(mockJiraService);
      await handler(req, res);

      expect(mockJiraService.clearCredentials).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should handle disconnect errors', async () => {
      vi.mocked(mockJiraService.clearCredentials).mockRejectedValue(
        new Error('Failed to clear credentials')
      );

      const handler = createDisconnectHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to clear credentials',
      });
    });
  });

  describe('boards handler', () => {
    it('should return boards list', async () => {
      vi.mocked(mockJiraService.getBoards).mockResolvedValue([
        {
          id: 1,
          name: 'My Scrum Board',
          type: 'scrum',
          project: { id: '100', key: 'PROJ', name: 'My Project' },
        },
        {
          id: 2,
          name: 'Kanban Board',
          type: 'kanban',
        },
      ]);

      const handler = createBoardsHandler(mockJiraService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        boards: [
          {
            id: 1,
            name: 'My Scrum Board',
            type: 'scrum',
            project: { id: '100', key: 'PROJ', name: 'My Project' },
          },
          {
            id: 2,
            name: 'Kanban Board',
            type: 'kanban',
          },
        ],
      });
    });

    it('should return 401 when not connected', async () => {
      vi.mocked(mockJiraService.getBoards).mockRejectedValue(new Error('Not connected to Jira'));

      const handler = createBoardsHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not connected to Jira',
      });
    });

    it('should handle API errors', async () => {
      vi.mocked(mockJiraService.getBoards).mockRejectedValue(new Error('API rate limit exceeded'));

      const handler = createBoardsHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'API rate limit exceeded',
      });
    });
  });

  describe('sprints handler', () => {
    it('should return sprints for a board', async () => {
      req.params = { boardId: '1' };

      vi.mocked(mockJiraService.getSprints).mockResolvedValue([
        {
          id: 10,
          name: 'Sprint 10',
          state: 'active',
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-14T00:00:00.000Z',
          boardId: 1,
        },
        {
          id: 11,
          name: 'Sprint 11',
          state: 'future',
          boardId: 1,
        },
      ]);

      const handler = createSprintsHandler(mockJiraService);
      await handler(req, res);

      expect(mockJiraService.getSprints).toHaveBeenCalledWith(1, undefined);
      expect(res.json).toHaveBeenCalledWith({
        sprints: expect.arrayContaining([expect.objectContaining({ id: 10, name: 'Sprint 10' })]),
      });
    });

    it('should filter sprints by state', async () => {
      req.params = { boardId: '1' };
      req.query = { state: 'active' };

      vi.mocked(mockJiraService.getSprints).mockResolvedValue([
        { id: 10, name: 'Sprint 10', state: 'active', boardId: 1 },
      ]);

      const handler = createSprintsHandler(mockJiraService);
      await handler(req, res);

      expect(mockJiraService.getSprints).toHaveBeenCalledWith(1, 'active');
    });

    it('should return 400 for invalid boardId', async () => {
      req.params = { boardId: 'invalid' };

      const handler = createSprintsHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid board ID',
      });
    });

    it('should return 401 when not connected', async () => {
      req.params = { boardId: '1' };

      vi.mocked(mockJiraService.getSprints).mockRejectedValue(new Error('Not connected to Jira'));

      const handler = createSprintsHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('sprint-issues handler', () => {
    it('should return sprint issues', async () => {
      req.body = {
        boardId: 1,
        statusFilter: 'todo',
      };

      vi.mocked(mockJiraService.getSprintIssuesForProject).mockResolvedValue({
        sprint: {
          id: 10,
          name: 'Sprint 10',
          state: 'active',
          boardId: 1,
        },
        issues: [
          {
            id: '10001',
            key: 'PROJ-1',
            summary: 'Implement feature',
            description: 'Details here',
            status: { id: '1', name: 'To Do', statusCategory: 'todo' },
            issueType: { id: '1', name: 'Story', subtask: false },
            labels: [],
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-02T00:00:00.000Z',
            url: 'https://mysite.atlassian.net/browse/PROJ-1',
          },
        ],
        total: 1,
      });

      const handler = createSprintIssuesHandler(mockJiraService);
      await handler(req, res);

      expect(mockJiraService.getSprintIssuesForProject).toHaveBeenCalledWith({
        boardId: 1,
        statusFilter: 'todo',
      });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sprint: expect.objectContaining({ name: 'Sprint 10' }),
          issues: expect.arrayContaining([expect.objectContaining({ key: 'PROJ-1' })]),
        })
      );
    });

    it('should accept sprintId parameter', async () => {
      req.body = {
        sprintId: 10,
        statusFilter: 'all',
        maxResults: 100,
      };

      vi.mocked(mockJiraService.getSprintIssuesForProject).mockResolvedValue({
        sprint: { id: 10, name: 'Sprint 10', state: 'active', boardId: 1 },
        issues: [],
        total: 0,
      });

      const handler = createSprintIssuesHandler(mockJiraService);
      await handler(req, res);

      expect(mockJiraService.getSprintIssuesForProject).toHaveBeenCalledWith({
        sprintId: 10,
        statusFilter: 'all',
        maxResults: 100,
      });
    });

    it('should return 401 when not connected', async () => {
      req.body = { boardId: 1 };

      vi.mocked(mockJiraService.getSprintIssuesForProject).mockRejectedValue(
        new Error('Not connected to Jira')
      );

      const handler = createSprintIssuesHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not connected to Jira',
      });
    });

    it('should return empty response when no active sprint', async () => {
      req.body = { boardId: 1 };

      vi.mocked(mockJiraService.getSprintIssuesForProject).mockResolvedValue({
        sprint: undefined,
        issues: [],
        total: 0,
      });

      const handler = createSprintIssuesHandler(mockJiraService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        sprint: undefined,
        issues: [],
        total: 0,
      });
    });

    it('should handle API errors', async () => {
      req.body = { boardId: 1 };

      vi.mocked(mockJiraService.getSprintIssuesForProject).mockRejectedValue(
        new Error('Jira API timeout')
      );

      const handler = createSprintIssuesHandler(mockJiraService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Jira API timeout',
      });
    });
  });
});
