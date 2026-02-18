/**
 * Jira Disconnect Route
 *
 * DELETE /api/jira/connection - Disconnect Jira integration
 *
 * Removes stored Jira credentials and disconnects the integration.
 * This endpoint clears the OAuth tokens and connection details from
 * the credentials store.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { JiraConnectionCredentials } from '@automaker/types';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('JiraDisconnect');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * DELETE /api/jira/connection
 *
 * Disconnect the Jira integration by removing stored credentials.
 *
 * Query parameters:
 * - connectionId (optional): Specific connection ID to remove.
 *   If not provided, removes the active connection or all connections.
 * - all (optional): Set to "true" to remove all Jira connections.
 *
 * Response:
 * - 200: { success: true, message: string }
 * - 400: { success: false, error: string } - Invalid request
 * - 404: { success: false, error: string } - Connection not found
 * - 500: { success: false, error: string } - Server error
 *
 * @param settingsService - Settings service for managing stored credentials
 */
export function createDisconnectHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Check if settings service is available
      if (!settingsService) {
        logger.error('Settings service not available for disconnect');
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      const connectionId = req.query.connectionId as string | undefined;
      const removeAll = req.query.all === 'true';

      // Get current credentials
      const credentials = await settingsService.getCredentials();
      const jiraConnections: JiraConnectionCredentials[] =
        (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

      if (jiraConnections.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No Jira connections found',
        });
        return;
      }

      let updatedConnections: JiraConnectionCredentials[];
      let removedConnectionName: string | undefined;

      if (removeAll) {
        // Remove all connections
        logger.info('Removing all Jira connections');
        updatedConnections = [];
      } else if (connectionId) {
        // Remove specific connection by ID
        const connectionToRemove = jiraConnections.find((conn) => conn.id === connectionId);

        if (!connectionToRemove) {
          res.status(404).json({
            success: false,
            error: `Jira connection with ID '${connectionId}' not found`,
          });
          return;
        }

        removedConnectionName = connectionToRemove.name;
        updatedConnections = jiraConnections.filter((conn) => conn.id !== connectionId);
        logger.info(`Removing Jira connection: ${removedConnectionName} (${connectionId})`);

        // If we removed the active connection, make the first remaining one active
        if (connectionToRemove.isActive && updatedConnections.length > 0) {
          updatedConnections[0].isActive = true;
          logger.info(`Set ${updatedConnections[0].name} as the new active connection`);
        }
      } else {
        // Remove the active connection (or first connection if none is active)
        const activeConnection =
          jiraConnections.find((conn) => conn.isActive) || jiraConnections[0];

        removedConnectionName = activeConnection.name;
        updatedConnections = jiraConnections.filter((conn) => conn.id !== activeConnection.id);
        logger.info(
          `Removing active Jira connection: ${removedConnectionName} (${activeConnection.id})`
        );

        // Make the first remaining connection active
        if (updatedConnections.length > 0) {
          updatedConnections[0].isActive = true;
          logger.info(`Set ${updatedConnections[0].name} as the new active connection`);
        }
      }

      // Update credentials with the modified connections array
      await settingsService.updateCredentials({
        ...credentials,
        jiraConnections: updatedConnections,
      });

      // Build response message
      let message: string;
      if (removeAll) {
        message = `Successfully removed all Jira connections (${jiraConnections.length} connection(s))`;
      } else if (removedConnectionName) {
        message = `Successfully disconnected Jira connection: ${removedConnectionName}`;
      } else {
        message = 'Successfully disconnected Jira';
      }

      logger.info(message);

      res.json({
        success: true,
        message,
        remainingConnections: updatedConnections.length,
      });
    } catch (error) {
      logger.error('Error disconnecting Jira:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
