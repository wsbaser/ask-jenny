/**
 * Jira Connection Routes
 *
 * POST /api/jira/auth/connect - Connect to Jira using Basic Auth or Personal Access Token
 *
 * This route provides an alternative to OAuth for users who:
 * - Don't want to set up OAuth
 * - Are using Jira Server/Data Center (on-premise)
 * - Prefer using API tokens or PAT
 *
 * Authentication Methods:
 * - basic: Email + API Token (Jira Cloud)
 * - pat: Personal Access Token (Jira Server/Data Center)
 */

import type { Request, Response } from 'express';
import crypto from 'crypto';
import { createLogger } from '@automaker/utils';
import { JiraService } from '../../../services/jira-service.js';
import type { JiraConnectionCredentials } from '../../../types/settings.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('JiraConnect');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Request body for connecting with Basic Auth
 */
interface BasicAuthConnectRequest {
  authMethod: 'basic';
  host: string;
  email: string;
  apiToken: string;
  deploymentType?: 'cloud' | 'server' | 'datacenter';
  connectionName?: string;
}

/**
 * Request body for connecting with Personal Access Token
 */
interface PATConnectRequest {
  authMethod: 'pat';
  host: string;
  personalAccessToken: string;
  deploymentType?: 'cloud' | 'server' | 'datacenter';
  connectionName?: string;
}

type ConnectRequest = BasicAuthConnectRequest | PATConnectRequest;

/**
 * POST /api/jira/auth/connect
 *
 * Connect to Jira using Basic Auth (email + API token) or Personal Access Token.
 *
 * Body (Basic Auth):
 * - authMethod: 'basic'
 * - host: Jira instance URL (e.g., "https://company.atlassian.net")
 * - email: User email address
 * - apiToken: API token from Atlassian account
 * - deploymentType?: 'cloud' | 'server' | 'datacenter' (default: 'cloud')
 * - connectionName?: Custom name for this connection
 *
 * Body (PAT):
 * - authMethod: 'pat'
 * - host: Jira instance URL
 * - personalAccessToken: Personal access token
 * - deploymentType?: 'cloud' | 'server' | 'datacenter' (default: 'server')
 * - connectionName?: Custom name for this connection
 *
 * @param settingsService - Settings service for storing credentials
 */
export function createConnectHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      const body = req.body as ConnectRequest;

      // Validate required fields
      if (!body.authMethod) {
        res.status(400).json({
          success: false,
          error: "authMethod is required. Must be 'basic' or 'pat'.",
        });
        return;
      }

      if (!body.host) {
        res.status(400).json({
          success: false,
          error: 'host is required. Provide the Jira instance URL.',
        });
        return;
      }

      // Normalize host URL
      let host = body.host.trim();
      if (!host.startsWith('http://') && !host.startsWith('https://')) {
        host = 'https://' + host;
      }
      // Remove trailing slash
      host = host.replace(/\/$/, '');

      // Validate based on auth method
      if (body.authMethod === 'basic') {
        if (!body.email || !body.apiToken) {
          res.status(400).json({
            success: false,
            error: 'email and apiToken are required for basic auth.',
          });
          return;
        }
      } else if (body.authMethod === 'pat') {
        if (!body.personalAccessToken) {
          res.status(400).json({
            success: false,
            error: 'personalAccessToken is required for PAT auth.',
          });
          return;
        }
      } else {
        res.status(400).json({
          success: false,
          error: "Invalid authMethod. Must be 'basic' or 'pat'.",
        });
        return;
      }

      logger.info(`Attempting to connect to Jira at ${host} using ${body.authMethod} auth`);

      // Create a JiraService instance to test the connection
      const jiraService = new JiraService();

      // Determine deployment type
      const deploymentType =
        body.deploymentType || (body.authMethod === 'pat' ? 'server' : 'cloud');

      try {
        if (body.authMethod === 'basic') {
          await jiraService.initialize({
            host,
            deploymentType,
            authMethod: 'basic',
            email: body.email,
            apiToken: body.apiToken,
          });
        } else {
          await jiraService.initialize({
            host,
            deploymentType,
            authMethod: 'pat',
            personalAccessToken: body.personalAccessToken,
          });
        }

        // Test the connection
        const status = await jiraService.testConnection();

        if (!status.connected) {
          res.status(401).json({
            success: false,
            error: status.error || 'Failed to connect to Jira. Please check your credentials.',
          });
          return;
        }

        logger.info(`Successfully connected to Jira as ${status.userDisplayName}`);

        // Store the connection credentials
        const credentials = await settingsService.getCredentials();
        const existingConnections: JiraConnectionCredentials[] =
          (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

        // Deactivate any existing active connections
        const updatedConnections: JiraConnectionCredentials[] = existingConnections.map(
          (conn: JiraConnectionCredentials) => ({
            ...conn,
            isActive: false as boolean | undefined,
          })
        );

        // Create new connection
        const connectionId = crypto.randomUUID();
        const newConnection: JiraConnectionCredentials = {
          id: connectionId,
          name: body.connectionName || extractHostname(host),
          host,
          deploymentType,
          authMethod: body.authMethod,
          isActive: true,
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        };

        if (body.authMethod === 'basic') {
          newConnection.email = body.email;
          newConnection.apiToken = body.apiToken;
        } else {
          newConnection.personalAccessToken = body.personalAccessToken;
        }

        updatedConnections.push(newConnection);

        // Save credentials
        await settingsService.updateCredentials({
          ...credentials,
          jiraConnections: updatedConnections,
        });

        logger.info(`Jira connection saved: ${newConnection.name}`);

        res.json({
          success: true,
          message: 'Successfully connected to Jira',
          connectionId,
          connectionName: newConnection.name,
          userDisplayName: status.userDisplayName,
          userAccountId: status.userAccountId,
        });
      } catch (connectError) {
        logger.error('Failed to connect to Jira:', connectError);
        res.status(401).json({
          success: false,
          error: `Connection failed: ${getErrorMessage(connectError)}`,
        });
      }
    } catch (error) {
      logger.error('Error in connect handler:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Extract hostname from URL for display
 */
function extractHostname(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}
