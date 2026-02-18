/**
 * Jira Projects Route
 *
 * GET /api/jira/projects - List Jira projects accessible to the authenticated user
 *
 * Query Parameters:
 * - startAt: Pagination start index (default: 0)
 * - maxResults: Maximum results (default: 50)
 *
 * Response:
 * {
 *   success: boolean,
 *   projects: JiraProject[],
 *   total: number,
 *   hasMore: boolean,
 *   error?: string
 * }
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { JiraService } from '../../../services/jira-service.js';
import type { JiraConnectionCredentials } from '../../../types/settings.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('JiraProjects');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Initialize JiraService with the active connection
 */
async function initializeJiraService(
  settingsService: SettingsService
): Promise<{ service: JiraService; error?: string }> {
  const credentials = await settingsService.getCredentials();
  const jiraConnections: JiraConnectionCredentials[] =
    (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

  const activeConnection =
    jiraConnections.find((conn: JiraConnectionCredentials) => conn.isActive) ||
    jiraConnections[0];

  if (!activeConnection || !activeConnection.accessToken) {
    return {
      service: new JiraService(),
      error: 'No Jira connection configured. Use the Jira authentication flow to connect.',
    };
  }

  const jiraService = new JiraService();

  // Build host URL - use cloudId for OAuth connections, or direct host for others
  let host = activeConnection.host;
  if (activeConnection.cloudId && activeConnection.authMethod === 'oauth2') {
    host = `https://api.atlassian.com/ex/jira/${activeConnection.cloudId}`;
  }

  await jiraService.initialize({
    host,
    deploymentType: activeConnection.deploymentType || 'cloud',
    authMethod: activeConnection.authMethod,
    accessToken: activeConnection.accessToken,
    email: activeConnection.email,
    apiToken: activeConnection.apiToken,
    personalAccessToken: activeConnection.personalAccessToken,
    tokenExpiresAt: activeConnection.tokenExpiresAt,
  });

  return { service: jiraService };
}

/**
 * GET /api/jira/projects
 *
 * List Jira projects accessible to the authenticated user.
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createProjectsHandler(settingsService?: SettingsService) {
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

      // Parse query parameters
      const startAt = parseInt(req.query.startAt as string) || 0;
      const maxResults = parseInt(req.query.maxResults as string) || 50;

      logger.info(`Fetching Jira projects (startAt: ${startAt}, maxResults: ${maxResults})`);

      const result = await service.getProjects({ startAt, maxResults });

      logger.info(`Found ${result.projects.length} Jira projects`);

      res.json({
        success: true,
        projects: result.projects,
        total: result.total,
        hasMore: result.hasMore,
      });
    } catch (error) {
      logger.error('Error fetching Jira projects:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

// Export the initializer for use by other routes
export { initializeJiraService };
