/**
 * Jira Connection Status Route
 *
 * GET /api/jira/status - Check Jira connection status
 *
 * Returns the current status of the Jira connection including:
 * - Whether OAuth is configured
 * - Whether the user is connected/authenticated
 * - User information if connected
 * - Error information if connection failed
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import {
  isAtlassianOAuthConfigured,
  shouldRefreshToken,
} from '../../../lib/passport-atlassian.js';
import { refreshJiraConnectionTokens } from './auth.js';
import type { JiraConnectionStatus } from '@automaker/types';
import type { JiraConnectionCredentials } from '../../../types/settings.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('JiraStatus');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Response from Atlassian /me endpoint
 */
interface AtlassianUserProfile {
  account_id: string;
  name: string;
  email?: string;
}

/**
 * Verify Jira connection by making a test API call
 *
 * @param accessToken - OAuth access token
 * @returns User profile if successful
 */
async function verifyJiraConnection(accessToken: string): Promise<{
  accountId: string;
  displayName: string;
  email?: string;
}> {
  const response = await fetch('https://api.atlassian.com/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to verify Jira connection: ${response.status}`);
  }

  const data = (await response.json()) as AtlassianUserProfile;
  return {
    accountId: data.account_id,
    displayName: data.name,
    email: data.email,
  };
}

/**
 * GET /api/jira/status
 *
 * Check the current Jira connection status. This endpoint verifies:
 * 1. Whether Jira OAuth is configured (environment variables set)
 * 2. Whether there are stored credentials
 * 3. Whether the stored credentials are valid (by making a test API call)
 *
 * Response format follows JiraConnectionStatus interface:
 * - connected: boolean - Whether connection is established
 * - userDisplayName?: string - User display name if connected
 * - userAccountId?: string - User account ID if connected
 * - error?: string - Error message if connection failed
 * - lastConnectedAt?: string - Timestamp of last successful connection
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createStatusHandler(settingsService?: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status: JiraConnectionStatus = {
        connected: false,
      };

      // Check if OAuth is configured via environment variables
      const oauthConfigured = isAtlassianOAuthConfigured();

      if (!oauthConfigured) {
        status.error = 'Jira OAuth is not configured. Set ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET environment variables.';
        res.json({
          success: true,
          ...status,
          configured: false,
        });
        return;
      }

      // If no settings service provided, we can only report OAuth configuration status
      if (!settingsService) {
        status.error = 'Settings service not available';
        res.json({
          success: true,
          ...status,
          configured: true,
        });
        return;
      }

      // Get stored credentials to check for existing Jira connection
      const credentials = await settingsService.getCredentials();
      const jiraConnections: JiraConnectionCredentials[] = (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

      // Find the active Jira connection
      const activeConnection = jiraConnections.find((conn: JiraConnectionCredentials) => conn.isActive) || jiraConnections[0];

      if (!activeConnection || !activeConnection.accessToken) {
        status.error = 'No Jira connection configured. Use the Jira authentication flow to connect.';
        res.json({
          success: true,
          ...status,
          configured: true,
        });
        return;
      }

      // Check if token needs refresh (expired or about to expire)
      let currentConnection = activeConnection;
      if (shouldRefreshToken(activeConnection.tokenExpiresAt)) {
        logger.info('Token expired or about to expire, attempting refresh...');

        if (activeConnection.refreshToken && settingsService) {
          // Attempt automatic token refresh
          const refreshedConnection = await refreshJiraConnectionTokens(activeConnection, settingsService);

          if (refreshedConnection) {
            logger.info('Token refreshed successfully');
            currentConnection = refreshedConnection;
          } else {
            // Refresh failed - check if token is actually expired
            const expiresAt = activeConnection.tokenExpiresAt
              ? new Date(activeConnection.tokenExpiresAt)
              : null;

            if (expiresAt && expiresAt <= new Date()) {
              status.error = 'Jira access token has expired and refresh failed. Please re-authenticate.';
              res.json({
                success: true,
                ...status,
                configured: true,
                tokenExpired: true,
              });
              return;
            }
            // Token not yet expired, continue with existing token
            logger.warn('Token refresh failed but token not yet expired, continuing...');
          }
        } else if (!activeConnection.refreshToken) {
          // No refresh token available
          const expiresAt = activeConnection.tokenExpiresAt
            ? new Date(activeConnection.tokenExpiresAt)
            : null;

          if (expiresAt && expiresAt <= new Date()) {
            status.error = 'Jira access token has expired. Please re-authenticate.';
            res.json({
              success: true,
              ...status,
              configured: true,
              tokenExpired: true,
            });
            return;
          }
        }
      }

      // Verify the connection by making a test API call
      try {
        const userProfile = await verifyJiraConnection(currentConnection.accessToken!);

        status.connected = true;
        status.userDisplayName = userProfile.displayName;
        status.userAccountId = userProfile.accountId;
        status.lastConnectedAt = currentConnection.lastUsedAt || new Date().toISOString();

        logger.info(`Jira connection verified for user: ${userProfile.displayName}`);

        res.json({
          success: true,
          ...status,
          configured: true,
          connectionName: currentConnection.name,
          host: currentConnection.host,
          tokenExpiresAt: currentConnection.tokenExpiresAt,
        });
      } catch (verifyError) {
        logger.warn('Failed to verify Jira connection:', verifyError);
        status.error = `Connection verification failed: ${getErrorMessage(verifyError)}`;
        res.json({
          success: true,
          ...status,
          configured: true,
        });
      }
    } catch (error) {
      logger.error('Error checking Jira status:', error);
      res.status(500).json({
        success: false,
        connected: false,
        error: getErrorMessage(error),
      });
    }
  };
}
