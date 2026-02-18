/**
 * Jira Issues Routes
 *
 * POST /api/jira/issues/search - Search Jira issues using JQL
 * GET /api/jira/issues/:issueKey - Get a single issue by key
 * GET /api/jira/issues/:issueKey/comments - Get comments for an issue
 *
 * Response formats follow JiraSearchResult and JiraCommentsResult interfaces.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../../services/settings-service.js';
import { initializeJiraService } from './projects.js';

const logger = createLogger('JiraIssues');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * POST /api/jira/issues/search
 *
 * Search Jira issues using JQL.
 *
 * Body:
 * - jql: JQL query string (required)
 * - startAt: Pagination start index (default: 0)
 * - maxResults: Maximum results (default: 50)
 * - fields: Fields to include (default: ['*navigable'])
 * - expand: Fields to expand
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createSearchIssuesHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      const { service, error } = await initializeJiraService(settingsService);
      if (error) {
        res.status(401).json({
          success: false,
          error,
        });
        return;
      }

      const { jql, startAt = 0, maxResults = 50, fields, expand } = req.body;

      if (!jql || typeof jql !== 'string') {
        res.status(400).json({
          success: false,
          error: 'JQL query is required',
        });
        return;
      }

      logger.info(`Searching Jira issues with JQL: ${jql.substring(0, 100)}...`);

      const result = await service.searchIssues({
        jql,
        startAt,
        maxResults,
        fields,
        expand,
      });

      logger.info(`Found ${result.issues.length} issues (total: ${result.total})`);

      res.json({
        success: true,
        issues: result.issues,
        total: result.total,
        startAt: result.startAt,
        maxResults: result.maxResults,
        hasMore: result.hasMore,
      });
    } catch (error) {
      logger.error('Error searching Jira issues:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * GET /api/jira/issues/:issueKey
 *
 * Get a single Jira issue by key.
 *
 * Path params:
 * - issueKey: Jira issue key (e.g., "PROJ-123")
 *
 * Query params:
 * - includeComments: Include comments (default: false)
 * - includeLinks: Include linked issues (default: false)
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createGetIssueHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      const { service, error } = await initializeJiraService(settingsService);
      if (error) {
        res.status(401).json({
          success: false,
          error,
        });
        return;
      }

      const { issueKey } = req.params;

      if (!issueKey) {
        res.status(400).json({
          success: false,
          error: 'Issue key is required',
        });
        return;
      }

      const includeComments = req.query.includeComments === 'true';
      const includeLinks = req.query.includeLinks === 'true';

      logger.info(`Fetching Jira issue: ${issueKey}`);

      const issue = await service.getIssue(issueKey, {
        includeComments,
        includeLinks,
      });

      logger.info(`Fetched issue: ${issue.key} - ${issue.summary}`);

      res.json({
        success: true,
        issue,
      });
    } catch (error) {
      logger.error(`Error fetching Jira issue ${req.params.issueKey}:`, error);

      // Check for 404 errors
      const errorMsg = getErrorMessage(error);
      if (errorMsg.includes('404') || errorMsg.toLowerCase().includes('not found')) {
        res.status(404).json({
          success: false,
          error: `Issue ${req.params.issueKey} not found`,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: errorMsg,
      });
    }
  };
}

/**
 * GET /api/jira/issues/:issueKey/comments
 *
 * Get comments for a Jira issue.
 *
 * Path params:
 * - issueKey: Jira issue key (e.g., "PROJ-123")
 *
 * Query params:
 * - startAt: Pagination start index (default: 0)
 * - maxResults: Maximum results (default: 50)
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createGetIssueCommentsHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      const { service, error } = await initializeJiraService(settingsService);
      if (error) {
        res.status(401).json({
          success: false,
          error,
        });
        return;
      }

      const { issueKey } = req.params;

      if (!issueKey) {
        res.status(400).json({
          success: false,
          error: 'Issue key is required',
        });
        return;
      }

      const startAt = parseInt(req.query.startAt as string) || 0;
      const maxResults = parseInt(req.query.maxResults as string) || 50;

      logger.info(`Fetching comments for Jira issue: ${issueKey}`);

      const result = await service.getIssueComments(issueKey, {
        startAt,
        maxResults,
      });

      logger.info(`Fetched ${result.comments.length} comments for issue ${issueKey}`);

      res.json({
        success: true,
        comments: result.comments,
        totalCount: result.totalCount,
        startAt: result.startAt,
        maxResults: result.maxResults,
        hasMore: result.hasMore,
      });
    } catch (error) {
      logger.error(`Error fetching comments for Jira issue ${req.params.issueKey}:`, error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
