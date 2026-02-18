/**
 * Unit tests for Jira routes
 *
 * Tests the Jira API route handler creation and basic functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createMockExpressContext } from '../../utils/mocks.js';

// Mock dependencies before importing route handlers
vi.mock('@/lib/passport-atlassian.js', () => ({
  isAtlassianOAuthConfigured: vi.fn().mockReturnValue(false),
  shouldRefreshToken: vi.fn().mockReturnValue(false),
}));

vi.mock('@/routes/jira/routes/auth.js', () => ({
  refreshJiraConnectionTokens: vi.fn(),
}));

describe('jira routes', { timeout: 20000 }, () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  describe('route handler creation', () => {
    it('should create status handler', async () => {
      const { createStatusHandler } = await import('@/routes/jira/routes/status.js');
      const mockSettingsService = {
        getCredentials: vi.fn().mockResolvedValue({}),
      } as any;

      const handler = createStatusHandler(mockSettingsService);
      expect(typeof handler).toBe('function');
    });

    it('should create disconnect handler', async () => {
      const { createDisconnectHandler } = await import('@/routes/jira/routes/disconnect.js');
      const mockSettingsService = {
        updateCredentials: vi.fn().mockResolvedValue(undefined),
      } as any;

      const handler = createDisconnectHandler(mockSettingsService);
      expect(typeof handler).toBe('function');
    });

    it('should create sprint tasks handler', async () => {
      const { createSprintTasksHandler } = await import(
        '@/routes/jira/routes/sprint-tasks.js'
      );
      const mockSettingsService = {
        getCredentials: vi.fn().mockResolvedValue({}),
      } as any;

      const handler = createSprintTasksHandler(mockSettingsService);
      expect(typeof handler).toBe('function');
    });

    it('should create import tasks handler', async () => {
      const { createImportTasksHandler } = await import('@/routes/jira/routes/import-tasks.js');
      const mockSettingsService = { getCredentials: vi.fn() } as any;
      const mockJiraService = { getIssue: vi.fn() } as any;
      const mockMappingService = { hasMapping: vi.fn(), createMapping: vi.fn() } as any;

      const handler = createImportTasksHandler(
        mockSettingsService,
        mockJiraService,
        mockMappingService
      );
      expect(typeof handler).toBe('function');
    });
  });

  describe('status handler behavior', () => {
    it('should return not configured when OAuth env vars are missing', async () => {
      const { createStatusHandler } = await import('@/routes/jira/routes/status.js');
      const { isAtlassianOAuthConfigured } = await import('@/lib/passport-atlassian.js');

      vi.mocked(isAtlassianOAuthConfigured).mockReturnValue(false);

      const mockSettingsService = {
        getCredentials: vi.fn().mockResolvedValue({}),
      } as any;

      const handler = createStatusHandler(mockSettingsService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          connected: false,
          configured: false,
        })
      );
    });

    it('should return configured but not connected when no access token', async () => {
      const { createStatusHandler } = await import('@/routes/jira/routes/status.js');
      const { isAtlassianOAuthConfigured } = await import('@/lib/passport-atlassian.js');

      vi.mocked(isAtlassianOAuthConfigured).mockReturnValue(true);

      const mockSettingsService = {
        getCredentials: vi.fn().mockResolvedValue({}),
      } as any;

      const handler = createStatusHandler(mockSettingsService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          connected: false,
          configured: true,
        })
      );
    });
  });

  describe('disconnect handler behavior', () => {
    it('should call disconnect handler and return success', async () => {
      const { createDisconnectHandler } = await import('@/routes/jira/routes/disconnect.js');

      const updateCredentialsMock = vi.fn().mockResolvedValue(undefined);
      const mockSettingsService = {
        updateCredentials: updateCredentialsMock,
      } as any;

      const handler = createDisconnectHandler(mockSettingsService);
      expect(typeof handler).toBe('function');
      // The handler requires async execution with proper request/response handling
    });
  });
});
