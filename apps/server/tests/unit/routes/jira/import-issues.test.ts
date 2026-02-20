/**
 * Unit tests for Jira import-issues route handler
 *
 * Tests feature creation from Jira issues, duplicate detection, and error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createImportIssuesHandler } from '@/routes/jira/routes/import-issues.js';
import type { JiraService } from '@/services/jira-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import { createMockExpressContext } from '../../utils/mocks.js';

describe('import-issues route handler', () => {
  let mockJiraService: JiraService;
  let mockFeatureLoader: FeatureLoader;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJiraService = {
      isConfigured: vi.fn().mockReturnValue(true),
      getConnectionStatus: vi.fn().mockResolvedValue({ connected: true }),
    } as any;

    mockFeatureLoader = {
      loadFeatures: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (projectPath, data) => ({
        id: `feature-${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    } as any;

    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  describe('validation', () => {
    it('should return 400 if projectPath is missing', async () => {
      req.body = { issueIds: ['PROJ-1'] };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'projectPath is required' });
    });

    it('should return 400 if issueIds is missing', async () => {
      req.body = { projectPath: '/test/project' };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'issueIds is required and cannot be empty' });
    });

    it('should return 400 if issueIds is empty array', async () => {
      req.body = { projectPath: '/test/project', issueIds: [] };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'issueIds is required and cannot be empty' });
    });

    it('should return 400 if issues array is missing', async () => {
      req.body = { projectPath: '/test/project', issueIds: ['PROJ-1'] };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Issue details are required. Include issues array with key, summary, description.',
      });
    });
  });

  describe('successful import', () => {
    it('should import single issue successfully', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [
          {
            key: 'PROJ-1',
            summary: 'Implement feature X',
            description: 'Description for feature X',
            url: 'https://jira.example.com/browse/PROJ-1',
            priority: 'High',
            issueType: 'Story',
            storyPoints: 5,
          },
        ],
        defaultCategory: 'Jira Import',
        includeIssueKey: true,
        includeUrl: true,
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledWith('/test/project', {
        title: 'PROJ-1: Implement feature X',
        description: expect.stringContaining(
          'Jira Issue: [PROJ-1](https://jira.example.com/browse/PROJ-1)'
        ),
        category: 'Jira Import',
        priority: 1, // High = 1
        status: 'backlog',
        jiraKey: 'PROJ-1',
        jiraUrl: 'https://jira.example.com/browse/PROJ-1',
        jiraIssueType: 'Story',
        jiraStoryPoints: 5,
      });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          successful: 1,
          failed: 0,
          duplicates: 0,
          results: [
            expect.objectContaining({
              issueKey: 'PROJ-1',
              success: true,
              featureId: expect.any(String),
            }),
          ],
        })
      );
    });

    it('should import multiple issues successfully', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1', 'PROJ-2', 'PROJ-3'],
        issues: [
          { key: 'PROJ-1', summary: 'Feature 1' },
          { key: 'PROJ-2', summary: 'Feature 2' },
          { key: 'PROJ-3', summary: 'Feature 3' },
        ],
        defaultCategory: 'Sprint Tasks',
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 3,
          successful: 3,
          failed: 0,
          duplicates: 0,
        })
      );
    });

    it('should not include issue key in title when includeIssueKey is false', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Implement feature X' }],
        includeIssueKey: false,
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          title: 'Implement feature X', // No PROJ-1 prefix
        })
      );
    });

    it('should not include URL in description when includeUrl is false', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [
          {
            key: 'PROJ-1',
            summary: 'Feature',
            description: 'Original description',
            url: 'https://jira.example.com/browse/PROJ-1',
          },
        ],
        includeUrl: false,
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          description: 'Original description', // No Jira Issue link
        })
      );
    });
  });

  describe('priority mapping', () => {
    const testCases = [
      { priority: 'Highest', expectedLevel: 0 },
      { priority: 'Blocker', expectedLevel: 0 },
      { priority: 'High', expectedLevel: 1 },
      { priority: 'Critical', expectedLevel: 1 },
      { priority: 'Medium', expectedLevel: 2 },
      { priority: 'Normal', expectedLevel: 2 },
      { priority: 'Low', expectedLevel: 3 },
      { priority: 'Lowest', expectedLevel: 4 },
      { priority: 'Trivial', expectedLevel: 4 },
      { priority: undefined, expectedLevel: 2 }, // Default
      { priority: 'Unknown', expectedLevel: 2 }, // Default for unknown
    ];

    testCases.forEach(({ priority, expectedLevel }) => {
      it(`should map priority "${priority}" to level ${expectedLevel}`, async () => {
        req.body = {
          projectPath: '/test/project',
          issueIds: ['PROJ-1'],
          issues: [{ key: 'PROJ-1', summary: 'Test', priority }],
        };

        const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
        await handler(req, res);

        expect(mockFeatureLoader.create).toHaveBeenCalledWith(
          '/test/project',
          expect.objectContaining({
            priority: expectedLevel,
          })
        );
      });
    });
  });

  describe('duplicate detection', () => {
    it('should detect duplicate by Jira key in title', async () => {
      vi.mocked(mockFeatureLoader.loadFeatures).mockResolvedValue([
        {
          id: 'existing-feature',
          title: 'PROJ-1: Existing feature',
          description: 'Description',
          status: 'backlog',
        },
      ]);

      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Same issue' }],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          successful: 0,
          duplicates: 1,
          results: [
            expect.objectContaining({
              issueKey: 'PROJ-1',
              success: false,
              duplicate: true,
            }),
          ],
        })
      );
    });

    it('should detect duplicate by Jira key in description', async () => {
      vi.mocked(mockFeatureLoader.loadFeatures).mockResolvedValue([
        {
          id: 'existing-feature',
          title: 'Existing feature',
          description: 'Jira Issue: [PROJ-1](https://jira.example.com/browse/PROJ-1)',
          status: 'backlog',
        },
      ]);

      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Same issue' }],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          duplicates: 1,
        })
      );
    });

    it('should import non-duplicate issues and skip duplicates', async () => {
      vi.mocked(mockFeatureLoader.loadFeatures).mockResolvedValue([
        {
          id: 'existing-feature',
          title: 'PROJ-1: Existing feature',
          description: 'Description',
          status: 'backlog',
        },
      ]);

      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1', 'PROJ-2'],
        issues: [
          { key: 'PROJ-1', summary: 'Duplicate issue' },
          { key: 'PROJ-2', summary: 'New issue' },
        ],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(1);
      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          jiraKey: 'PROJ-2',
        })
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 2,
          successful: 1,
          duplicates: 1,
        })
      );
    });

    it('should track newly imported issues for duplicate detection', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1', 'PROJ-1'],
        issues: [
          { key: 'PROJ-1', summary: 'First import' },
          { key: 'PROJ-1', summary: 'Same issue again' },
        ],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      // First one should succeed, second should be duplicate
      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 2,
          successful: 1,
          duplicates: 1,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle feature creation failure', async () => {
      vi.mocked(mockFeatureLoader.create).mockRejectedValueOnce(
        new Error('Failed to write feature file')
      );

      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Test feature' }],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          successful: 0,
          failed: 1,
          results: [
            expect.objectContaining({
              issueKey: 'PROJ-1',
              success: false,
              error: 'Failed to write feature file',
            }),
          ],
        })
      );
    });

    it('should continue importing after one failure', async () => {
      vi.mocked(mockFeatureLoader.create)
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({
          id: 'feature-2',
          title: 'Feature 2',
          status: 'backlog',
        });

      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1', 'PROJ-2'],
        issues: [
          { key: 'PROJ-1', summary: 'First feature' },
          { key: 'PROJ-2', summary: 'Second feature' },
        ],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 2,
          successful: 1,
          failed: 1,
        })
      );
    });

    it('should return 401 if not connected to Jira', async () => {
      vi.mocked(mockFeatureLoader.loadFeatures).mockRejectedValueOnce(
        new Error('Not connected to Jira')
      );

      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Test' }],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not connected to Jira' });
    });

    it('should return 500 for general errors', async () => {
      vi.mocked(mockFeatureLoader.loadFeatures).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Test' }],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database connection failed' });
    });
  });

  describe('default category', () => {
    it('should use default category when not specified', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Test' }],
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          category: 'Jira Import',
        })
      );
    });

    it('should use custom category when provided', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Test' }],
        defaultCategory: 'Sprint 42',
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          category: 'Sprint 42',
        })
      );
    });
  });

  describe('description handling', () => {
    it('should use summary as description when description is missing', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [{ key: 'PROJ-1', summary: 'Feature summary' }],
        includeUrl: false,
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          description: 'Feature summary',
        })
      );
    });

    it('should use description when provided', async () => {
      req.body = {
        projectPath: '/test/project',
        issueIds: ['PROJ-1'],
        issues: [
          {
            key: 'PROJ-1',
            summary: 'Feature summary',
            description: 'Detailed description here',
          },
        ],
        includeUrl: false,
      };

      const handler = createImportIssuesHandler(mockJiraService, mockFeatureLoader);
      await handler(req, res);

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          description: 'Detailed description here',
        })
      );
    });
  });
});
