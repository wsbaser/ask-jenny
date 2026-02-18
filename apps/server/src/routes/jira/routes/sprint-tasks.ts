/**
 * Jira Sprint Tasks Route
 *
 * GET /api/jira/sprint/tasks - Get tasks from active sprints
 *
 * Returns all issues from active sprints across boards. This endpoint provides
 * a consolidated view of current sprint work items grouped by sprint.
 *
 * Query Parameters:
 * - projectKey: Filter by project key (optional)
 * - boardId: Filter by specific board ID (optional, more efficient if known)
 * - maxResults: Maximum results per sprint (default 100)
 *
 * Response format:
 * {
 *   success: boolean,
 *   sprints: Array<{
 *     sprint: JiraSprint,
 *     board: JiraBoard,
 *     issues: JiraIssue[],
 *     total: number
 *   }>,
 *   totalIssues: number,
 *   error?: string
 * }
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { JiraService } from '../../../services/jira-service.js';
import type { JiraConnectionCredentials } from '../../../types/settings.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('JiraSprintTasks');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * GET /api/jira/sprint/tasks
 *
 * Get all tasks from active sprints. This endpoint:
 * 1. Validates the Jira connection is configured
 * 2. Initializes the JiraService with stored credentials
 * 3. Fetches all issues from active sprints
 * 4. Returns issues grouped by sprint and board
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createSprintTasksHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate settings service is available
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      // Get stored credentials to check for existing Jira connection
      const credentials = await settingsService.getCredentials();
      const jiraConnections: JiraConnectionCredentials[] =
        (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

      // Find the active Jira connection
      const activeConnection =
        jiraConnections.find((conn: JiraConnectionCredentials) => conn.isActive) ||
        jiraConnections[0];

      if (!activeConnection || !activeConnection.accessToken) {
        res.status(401).json({
          success: false,
          error: 'No Jira connection configured. Use the Jira authentication flow to connect.',
        });
        return;
      }

      // Check if we have cloud ID for OAuth connections
      if (!activeConnection.cloudId) {
        res.status(400).json({
          success: false,
          error: 'Jira Cloud ID not found. Please re-authenticate with Jira.',
        });
        return;
      }

      // Parse query parameters
      const projectKey = req.query.projectKey as string | undefined;
      const boardIdParam = req.query.boardId as string | undefined;
      const maxResultsParam = req.query.maxResults as string | undefined;

      const boardId = boardIdParam ? parseInt(boardIdParam, 10) : undefined;
      const maxResults = maxResultsParam ? parseInt(maxResultsParam, 10) : 100;

      // Validate numeric parameters
      if (boardIdParam && (isNaN(boardId!) || boardId! <= 0)) {
        res.status(400).json({
          success: false,
          error: 'Invalid boardId parameter. Must be a positive integer.',
        });
        return;
      }

      if (maxResultsParam && (isNaN(maxResults) || maxResults <= 0 || maxResults > 1000)) {
        res.status(400).json({
          success: false,
          error: 'Invalid maxResults parameter. Must be a positive integer up to 1000.',
        });
        return;
      }

      // Initialize JiraService with the active connection
      const jiraService = new JiraService();

      // Build the host URL for Jira Cloud (using cloudId)
      const host = `https://api.atlassian.com/ex/jira/${activeConnection.cloudId}`;

      await jiraService.initialize({
        host,
        deploymentType: 'cloud',
        authMethod: 'oauth2',
        accessToken: activeConnection.accessToken,
        tokenExpiresAt: activeConnection.tokenExpiresAt,
      });

      logger.info(
        `Fetching active sprint tasks${projectKey ? ` for project ${projectKey}` : ''}${boardId ? ` for board ${boardId}` : ''}`
      );

      // Fetch active sprint tasks
      const result = await jiraService.getActiveSprintTasks({
        projectKeyOrId: projectKey,
        boardId,
        maxResults,
      });

      logger.info(
        `Found ${result.totalIssues} issues across ${result.sprints.length} active sprint(s)`
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error('Error fetching sprint tasks:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
