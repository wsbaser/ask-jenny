/**
 * Jira OAuth Authentication Routes
 *
 * Handles OAuth2 flow for Jira Cloud authentication:
 * - GET /auth - Initiate OAuth flow (redirect to Atlassian)
 * - GET /auth/callback - Handle OAuth callback from Atlassian
 * - GET /auth/status - Check authentication status
 *
 * @see ../../lib/passport-atlassian.ts for OAuth2 configuration
 */

import type { Request, Response } from 'express';
import crypto from 'crypto';
import { createLogger } from '@automaker/utils';
import {
  getAtlassianConfigFromEnv,
  generateAuthorizationUrl,
  isAtlassianOAuthConfigured,
  storeAuthResult,
  refreshAccessToken,
  shouldRefreshToken,
  calculateTokenExpiry,
  type AtlassianAuthResult,
  type AtlassianAccessibleResource,
} from '../../../lib/passport-atlassian.js';
import type { SettingsService } from '../../../services/settings-service.js';
import type { JiraConnectionCredentials } from '../../../types/settings.js';

const logger = createLogger('JiraAuth');

/**
 * State tokens for CSRF protection during OAuth flow
 * Maps state token to creation timestamp for cleanup
 */
const pendingStateTokens = new Map<string, number>();

// Clean up expired state tokens every 5 minutes
// State tokens are valid for 10 minutes
const STATE_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
setInterval(
  () => {
    const now = Date.now();
    pendingStateTokens.forEach((timestamp, token) => {
      if (now - timestamp > STATE_TOKEN_TTL_MS) {
        pendingStateTokens.delete(token);
      }
    });
  },
  5 * 60 * 1000
);

/**
 * Generate a secure state token for CSRF protection
 */
function generateStateToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  pendingStateTokens.set(token, Date.now());
  return token;
}

/**
 * Validate and consume a state token
 */
export function validateStateToken(token: string): boolean {
  if (!pendingStateTokens.has(token)) {
    return false;
  }

  const timestamp = pendingStateTokens.get(token)!;
  pendingStateTokens.delete(token);

  // Check if token has expired
  return Date.now() - timestamp < STATE_TOKEN_TTL_MS;
}

/**
 * Parse state parameter to extract token and optional return URL
 * Format: "token|encodedReturnUrl" or just "token"
 */
function parseStateParam(state: string): { token: string; returnUrl?: string } {
  const pipeIndex = state.indexOf('|');
  if (pipeIndex === -1) {
    return { token: state };
  }
  const token = state.substring(0, pipeIndex);
  const encodedReturnUrl = state.substring(pipeIndex + 1);
  try {
    return { token, returnUrl: decodeURIComponent(encodedReturnUrl) };
  } catch {
    return { token };
  }
}

/**
 * GET /api/jira/auth
 *
 * Initiates the Jira OAuth2 flow by redirecting the user to Atlassian's
 * authorization page. After the user grants permission, Atlassian will
 * redirect back to /api/jira/auth/callback with an authorization code.
 *
 * Query parameters:
 * - returnUrl (optional): URL to redirect to after successful authentication
 *
 * Response:
 * - 302 redirect to Atlassian authorization URL
 * - 503 if OAuth is not configured
 */
export function createAuthInitHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Check if OAuth is configured
      if (!isAtlassianOAuthConfigured()) {
        logger.warn('Jira OAuth authentication attempted but not configured');
        res.status(503).json({
          success: false,
          error: 'Jira OAuth is not configured',
          details:
            'Please set ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET environment variables',
        });
        return;
      }

      // Get OAuth configuration
      const config = getAtlassianConfigFromEnv();
      if (!config) {
        logger.error('Failed to get Atlassian OAuth configuration');
        res.status(500).json({
          success: false,
          error: 'Failed to load OAuth configuration',
        });
        return;
      }

      // Generate state token for CSRF protection
      const state = generateStateToken();

      // Store return URL in state if provided (encoded in the state parameter)
      // Format: "randomToken|returnUrl" or just "randomToken" if no return URL
      const returnUrl = req.query.returnUrl as string | undefined;
      const stateWithReturn = returnUrl ? state + '|' + encodeURIComponent(returnUrl) : state;

      // Generate the authorization URL
      const authUrl = generateAuthorizationUrl(config, stateWithReturn);

      logger.info('Initiating Jira OAuth flow');
      logger.debug('Redirect URL: ' + authUrl);

      // Redirect user to Atlassian authorization page
      res.redirect(authUrl);
    } catch (error) {
      logger.error('Error initiating Jira OAuth flow:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate OAuth flow',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Exchange authorization code for access tokens
 *
 * Makes a POST request to Atlassian's token endpoint to exchange
 * the authorization code for access and refresh tokens.
 */
async function exchangeCodeForTokens(
  code: string,
  config: { clientId: string; clientSecret: string; callbackUrl: string }
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const tokenUrl = 'https://auth.atlassian.com/oauth/token';

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Token exchange failed: ' + response.status + ' ' + errorText);
    throw new Error('Token exchange failed: ' + response.status);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  }>;
}

/**
 * Fetch user profile from Atlassian
 */
async function fetchUserProfile(accessToken: string): Promise<{
  account_id: string;
  email: string;
  name: string;
  picture?: string;
}> {
  const response = await fetch('https://api.atlassian.com/me', {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user profile: ' + response.status);
  }

  return response.json() as Promise<{
    account_id: string;
    email: string;
    name: string;
    picture?: string;
  }>;
}

/**
 * Fetch accessible Atlassian cloud resources (sites/products the user has access to)
 */
async function fetchAccessibleResources(
  accessToken: string
): Promise<AtlassianAccessibleResource[]> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch accessible resources: ' + response.status);
  }

  return response.json() as Promise<AtlassianAccessibleResource[]>;
}

/**
 * GET /api/jira/auth/status
 *
 * Check the current Jira OAuth authentication status.
 * Returns whether OAuth is configured and if the user is authenticated.
 *
 * Response:
 * - 200: { success: true, configured: boolean, authenticated: boolean, ... }
 * - 500: { success: false, error: string }
 */
export function createAuthStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Check if OAuth is configured
      const configured = isAtlassianOAuthConfigured();

      if (!configured) {
        res.json({
          success: true,
          configured: false,
          authenticated: false,
          message: 'Jira OAuth is not configured. Set ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET environment variables.',
        });
        return;
      }

      // OAuth is configured but we need to check if there are stored credentials
      // For now, we just report that OAuth is configured
      // Full authentication status check will be implemented when we have credential storage
      res.json({
        success: true,
        configured: true,
        authenticated: false,
        message: 'Jira OAuth is configured. Use GET /api/jira/auth to initiate authentication.',
      });
    } catch (error) {
      logger.error('Error checking Jira auth status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check authentication status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * GET /api/jira/auth/callback
 *
 * Handle OAuth callback from Atlassian after user authorizes the app.
 * Exchanges the authorization code for access and refresh tokens,
 * fetches user profile and accessible resources, then stores credentials.
 *
 * Query parameters:
 * - code: Authorization code from Atlassian
 * - state: CSRF protection state token (may include return URL)
 * - error: Error code if authorization failed
 * - error_description: Human-readable error description
 *
 * Response:
 * - 302 redirect to returnUrl on success
 * - 302 redirect to error page on failure
 */
export function createAuthCallbackHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Handle error response from Atlassian
      if (req.query.error) {
        const error = req.query.error as string;
        const errorDescription = req.query.error_description as string | undefined;
        logger.error(`OAuth callback error: ${error} - ${errorDescription}`);
        res.status(400).json({
          success: false,
          error: 'OAuth authorization failed',
          details: errorDescription || error,
        });
        return;
      }

      // Get authorization code and state from query params
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code) {
        res.status(400).json({
          success: false,
          error: 'Missing authorization code',
        });
        return;
      }

      // Validate state token for CSRF protection
      const { token, returnUrl } = parseStateParam(state || '');
      if (!validateStateToken(token)) {
        logger.warn('Invalid or expired state token in OAuth callback');
        res.status(400).json({
          success: false,
          error: 'Invalid or expired state token. Please try authenticating again.',
        });
        return;
      }

      // Get OAuth configuration
      const config = getAtlassianConfigFromEnv();
      if (!config) {
        res.status(500).json({
          success: false,
          error: 'OAuth configuration not available',
        });
        return;
      }

      // Exchange authorization code for tokens
      logger.info('Exchanging authorization code for tokens');
      const tokens = await exchangeCodeForTokens(code, config);

      // Fetch user profile
      logger.info('Fetching user profile');
      const userProfile = await fetchUserProfile(tokens.access_token);

      // Fetch accessible resources (Jira sites)
      logger.info('Fetching accessible Jira resources');
      const resources = await fetchAccessibleResources(tokens.access_token);

      if (resources.length === 0) {
        logger.warn('No accessible Jira resources found for user');
        res.status(400).json({
          success: false,
          error: 'No Jira sites found. Please ensure you have access to a Jira Cloud instance.',
        });
        return;
      }

      // Use the first accessible resource as the Jira host
      const primaryResource = resources[0];
      const jiraHost = `https://api.atlassian.com/ex/jira/${primaryResource.id}`;

      // Calculate token expiry timestamp
      const tokenExpiresAt = calculateTokenExpiry(tokens.expires_in);

      // Create Jira connection credentials
      const connectionId = crypto.randomUUID();
      const jiraConnection: JiraConnectionCredentials = {
        id: connectionId,
        name: primaryResource.name || 'Jira Cloud',
        host: jiraHost,
        deploymentType: 'cloud',
        authMethod: 'oauth2',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        cloudId: primaryResource.id,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };

      // Store credentials if settings service is available
      if (settingsService) {
        try {
          const credentials = await settingsService.getCredentials();
          const existingConnections: JiraConnectionCredentials[] =
            (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

          // Deactivate any existing active connections
          const updatedConnections: JiraConnectionCredentials[] = existingConnections.map((conn: JiraConnectionCredentials) => ({
            ...conn,
            isActive: false as boolean | undefined,
          }));

          // Add the new connection
          updatedConnections.push(jiraConnection);

          // Update credentials
          await settingsService.updateCredentials({
            ...credentials,
            jiraConnections: updatedConnections,
          });

          logger.info(`Jira OAuth credentials stored for ${primaryResource.name}`);
        } catch (storeError) {
          logger.error('Failed to store Jira credentials:', storeError);
          // Continue - we can still return success with tokens in response
        }
      } else {
        logger.warn('SettingsService not available - credentials not persisted');
      }

      // Store result for potential retrieval
      storeAuthResult(token, {
        result: {
          profile: {
            id: userProfile.account_id,
            displayName: userProfile.name,
            email: userProfile.email,
          },
          tokens: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in,
            scope: tokens.scope,
          },
          accessibleResources: resources,
        },
      });

      logger.info(`Jira OAuth authentication completed for user: ${userProfile.name}`);

      // Redirect to return URL or respond with success
      if (returnUrl) {
        res.redirect(returnUrl);
      } else {
        res.json({
          success: true,
          message: 'Jira authentication successful',
          user: {
            accountId: userProfile.account_id,
            name: userProfile.name,
            email: userProfile.email,
          },
          site: {
            id: primaryResource.id,
            name: primaryResource.name,
            url: primaryResource.url,
          },
          tokenExpiresAt,
        });
      }
    } catch (error) {
      logger.error('Error handling OAuth callback:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to complete OAuth authentication',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * POST /api/jira/auth/refresh
 *
 * Manually trigger a token refresh for the active Jira connection.
 * This can be called proactively to refresh tokens before they expire,
 * or after receiving a 401 error from the Jira API.
 *
 * The automatic token refresh is handled by the JiraService, but this
 * endpoint allows explicit refresh when needed.
 *
 * Response:
 * - 200: { success: true, tokenExpiresAt: string }
 * - 400: { success: false, error: string } - No refresh token available
 * - 500: { success: false, error: string } - Refresh failed
 */
export function createAuthRefreshHandler(settingsService?: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      // Get current credentials
      const credentials = await settingsService.getCredentials();
      const jiraConnections: JiraConnectionCredentials[] =
        (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

      // Find the active connection
      const activeConnection = jiraConnections.find((conn: JiraConnectionCredentials) => conn.isActive);

      if (!activeConnection) {
        res.status(400).json({
          success: false,
          error: 'No active Jira connection found',
        });
        return;
      }

      if (!activeConnection.refreshToken) {
        res.status(400).json({
          success: false,
          error: 'No refresh token available. Please re-authenticate.',
        });
        return;
      }

      // Refresh the token
      logger.info(`Refreshing token for Jira connection: ${activeConnection.name}`);
      const newTokens = await refreshAccessToken(
        activeConnection.refreshToken,
        activeConnection.clientId,
        activeConnection.clientSecret
      );

      // Calculate new expiry time
      const tokenExpiresAt = calculateTokenExpiry(newTokens.expires_in);

      // Update the connection with new tokens
      const updatedConnections = jiraConnections.map((conn: JiraConnectionCredentials) => {
        if (conn.id === activeConnection.id) {
          return {
            ...conn,
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
            tokenExpiresAt,
            lastUsedAt: new Date().toISOString(),
          };
        }
        return conn;
      });

      // Save updated credentials
      await settingsService.updateCredentials({
        ...credentials,
        jiraConnections: updatedConnections,
      });

      logger.info(`Token refreshed successfully for ${activeConnection.name}`);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        tokenExpiresAt,
      });
    } catch (error) {
      logger.error('Error refreshing Jira token:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to refresh token',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Helper function to refresh tokens for a Jira connection and update storage
 *
 * This is exported for use by other modules (e.g., JiraService, status route)
 * to automatically refresh tokens when they're about to expire.
 *
 * @param connection - The Jira connection credentials to refresh
 * @param settingsService - Settings service for updating stored credentials
 * @returns Updated connection credentials with new tokens, or null if refresh failed
 */
export async function refreshJiraConnectionTokens(
  connection: JiraConnectionCredentials,
  settingsService: SettingsService
): Promise<JiraConnectionCredentials | null> {
  if (!connection.refreshToken) {
    logger.warn(`Cannot refresh tokens for ${connection.name}: no refresh token available`);
    return null;
  }

  try {
    logger.info(`Auto-refreshing token for Jira connection: ${connection.name}`);

    const newTokens = await refreshAccessToken(
      connection.refreshToken,
      connection.clientId,
      connection.clientSecret
    );

    const tokenExpiresAt = calculateTokenExpiry(newTokens.expires_in);

    // Update the connection object
    const updatedConnection: JiraConnectionCredentials = {
      ...connection,
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      tokenExpiresAt,
      lastUsedAt: new Date().toISOString(),
    };

    // Get current credentials and update the connection
    const credentials = await settingsService.getCredentials();
    const jiraConnections: JiraConnectionCredentials[] =
      (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

    const updatedConnections = jiraConnections.map((conn: JiraConnectionCredentials) => {
      if (conn.id === connection.id) {
        return updatedConnection;
      }
      return conn;
    });

    // Save updated credentials
    await settingsService.updateCredentials({
      ...credentials,
      jiraConnections: updatedConnections,
    });

    logger.info(`Token auto-refreshed successfully for ${connection.name}`);
    return updatedConnection;
  } catch (error) {
    logger.error(`Failed to auto-refresh token for ${connection.name}:`, error);
    return null;
  }
}
