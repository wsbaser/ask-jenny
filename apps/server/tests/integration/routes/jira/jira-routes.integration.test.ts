/**
 * Integration tests for Jira API routes
 *
 * Tests the full route stack including middleware, handlers, and service interactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createJiraRoutes } from '@/routes/jira/index.js';
import type { JiraService } from '@/services/jira-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';

describe('Jira API routes integration', () => {
  let app: Express;
  let mockJiraService: JiraService;
  let mockFeatureLoader: FeatureLoader;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock services
    mockJiraService = {
      isConfigured: vi.fn().mockReturnValue(true),
      getConnectionStatus: vi.fn().mockResolvedValue({
        configured: true,
        connected: true,
        siteName: 'Test Site',
        siteUrl: 'https://test.atlassian.net',
      }),
      initiateOAuth: vi.fn().mockResolvedValue({
        authorizationUrl: 'https://auth.atlassian.com/authorize?...',
        state: 'test-state',
      }),
      validateOAuthState: vi.fn().mockReturnValue({ valid: true }),
      exchangeCodeForTokens: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      }),
      getAccessibleResources: vi
        .fn()
        .mockResolvedValue([
          { id: 'cloud-id', name: 'Test Site', url: 'https://test.atlassian.net' },
        ]),
      saveCredentials: vi.fn().mockResolvedValue(undefined),
      clearCredentials: vi.fn().mockResolvedValue(undefined),
      getBoards: vi.fn().mockResolvedValue([{ id: 1, name: 'Test Board', type: 'scrum' }]),
      getSprints: vi
        .fn()
        .mockResolvedValue([{ id: 10, name: 'Sprint 10', state: 'active', boardId: 1 }]),
      getSprintIssuesForProject: vi.fn().mockResolvedValue({
        sprint: { id: 10, name: 'Sprint 10', state: 'active', boardId: 1 },
        issues: [],
        total: 0,
      }),
    } as any;

    mockFeatureLoader = {
      loadFeatures: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (path, data) => ({
        id: 'feature-123',
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    } as any;

    // Create Express app with Jira routes
    app = express();
    app.use(express.json());
    app.use('/api/jira', createJiraRoutes(mockJiraService, mockFeatureLoader));
  });

  describe('GET /api/jira/status', () => {
    it('should return connection status', async () => {
      const response = await request(app).get('/api/jira/status').expect(200);

      expect(response.body).toEqual({
        configured: true,
        connected: true,
        siteName: 'Test Site',
        siteUrl: 'https://test.atlassian.net',
      });
    });

    it('should return not connected status', async () => {
      vi.mocked(mockJiraService.getConnectionStatus).mockResolvedValue({
        configured: true,
        connected: false,
      });

      const response = await request(app).get('/api/jira/status').expect(200);

      expect(response.body).toEqual({
        configured: true,
        connected: false,
      });
    });
  });

  describe('POST /api/jira/connect', () => {
    it('should return authorization URL', async () => {
      const response = await request(app)
        .post('/api/jira/connect')
        .send({ returnUrl: 'http://localhost:3007/board' })
        .expect(200);

      expect(response.body).toEqual({
        authorizationUrl: 'https://auth.atlassian.com/authorize?...',
      });

      expect(mockJiraService.initiateOAuth).toHaveBeenCalledWith('http://localhost:3007/board');
    });

    it('should handle not configured error', async () => {
      vi.mocked(mockJiraService.initiateOAuth).mockRejectedValue(
        new Error('Jira OAuth is not configured')
      );

      const response = await request(app).post('/api/jira/connect').send({}).expect(400);

      expect(response.body.error).toContain('not configured');
    });
  });

  describe('GET /api/jira/callback', () => {
    it('should handle successful OAuth callback', async () => {
      const response = await request(app)
        .get('/api/jira/callback')
        .query({ code: 'auth-code', state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain('jiraConnected=true');
      expect(mockJiraService.saveCredentials).toHaveBeenCalled();
    });

    it('should handle missing code', async () => {
      const response = await request(app)
        .get('/api/jira/callback')
        .query({ state: 'test-state' })
        .expect(400);

      expect(response.body.error).toBe('Missing authorization code');
    });

    it('should handle invalid state', async () => {
      vi.mocked(mockJiraService.validateOAuthState).mockReturnValue({
        valid: false,
      });

      const response = await request(app)
        .get('/api/jira/callback')
        .query({ code: 'auth-code', state: 'invalid-state' })
        .expect(400);

      expect(response.body.error).toBe('Invalid or expired state parameter');
    });
  });

  describe('POST /api/jira/disconnect', () => {
    it('should disconnect successfully', async () => {
      const response = await request(app).post('/api/jira/disconnect').expect(200);

      expect(response.body).toEqual({ success: true });
      expect(mockJiraService.clearCredentials).toHaveBeenCalled();
    });
  });

  describe('GET /api/jira/boards', () => {
    it('should return boards list', async () => {
      const response = await request(app).get('/api/jira/boards').expect(200);

      expect(response.body).toEqual({
        boards: [{ id: 1, name: 'Test Board', type: 'scrum' }],
      });
    });

    it('should handle not connected error', async () => {
      vi.mocked(mockJiraService.getBoards).mockRejectedValue(new Error('Not connected to Jira'));

      const response = await request(app).get('/api/jira/boards').expect(401);

      expect(response.body.error).toBe('Not connected to Jira');
    });
  });

  describe('GET /api/jira/boards/:boardId/sprints', () => {
    it('should return sprints for board', async () => {
      const response = await request(app).get('/api/jira/boards/1/sprints').expect(200);

      expect(response.body).toEqual({
        sprints: [{ id: 10, name: 'Sprint 10', state: 'active', boardId: 1 }],
      });
    });

    it('should filter by state', async () => {
      await request(app).get('/api/jira/boards/1/sprints').query({ state: 'active' }).expect(200);

      expect(mockJiraService.getSprints).toHaveBeenCalledWith(1, 'active');
    });

    it('should handle invalid board ID', async () => {
      const response = await request(app).get('/api/jira/boards/invalid/sprints').expect(400);

      expect(response.body.error).toBe('Invalid board ID');
    });
  });

  describe('POST /api/jira/sprint-issues', () => {
    it('should return sprint issues', async () => {
      const response = await request(app)
        .post('/api/jira/sprint-issues')
        .send({ boardId: 1, statusFilter: 'todo' })
        .expect(200);

      expect(response.body).toMatchObject({
        sprint: { id: 10, name: 'Sprint 10' },
        issues: [],
        total: 0,
      });
    });
  });

  describe('POST /api/jira/import', () => {
    it('should import issues as features', async () => {
      const response = await request(app)
        .post('/api/jira/import')
        .send({
          projectPath: '/test/project',
          issueIds: ['PROJ-1'],
          issues: [
            {
              key: 'PROJ-1',
              summary: 'Test feature',
              description: 'Description',
              url: 'https://jira.example.com/browse/PROJ-1',
              priority: 'High',
              issueType: 'Story',
            },
          ],
          defaultCategory: 'Sprint Import',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        total: 1,
        successful: 1,
        failed: 0,
        duplicates: 0,
      });

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          title: 'PROJ-1: Test feature',
          category: 'Sprint Import',
          jiraKey: 'PROJ-1',
        })
      );
    });

    it('should detect duplicates', async () => {
      vi.mocked(mockFeatureLoader.loadFeatures).mockResolvedValue([
        {
          id: 'existing',
          title: 'PROJ-1: Existing feature',
          description: 'Exists',
          status: 'backlog',
        },
      ]);

      const response = await request(app)
        .post('/api/jira/import')
        .send({
          projectPath: '/test/project',
          issueIds: ['PROJ-1'],
          issues: [{ key: 'PROJ-1', summary: 'Duplicate' }],
        })
        .expect(200);

      expect(response.body).toMatchObject({
        total: 1,
        successful: 0,
        duplicates: 1,
      });
    });

    it('should return 400 for missing projectPath', async () => {
      const response = await request(app)
        .post('/api/jira/import')
        .send({ issueIds: ['PROJ-1'] })
        .expect(400);

      expect(response.body.error).toBe('projectPath is required');
    });

    it('should return 400 for missing issues', async () => {
      const response = await request(app)
        .post('/api/jira/import')
        .send({
          projectPath: '/test/project',
          issueIds: ['PROJ-1'],
        })
        .expect(400);

      expect(response.body.error).toContain('Issue details are required');
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      vi.mocked(mockJiraService.getConnectionStatus).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app).get('/api/jira/status').expect(500);

      expect(response.body.error).toBe('Database connection failed');
    });
  });
});
