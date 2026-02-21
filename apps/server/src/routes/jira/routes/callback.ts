/**
 * GET /api/jira/callback - Handle OAuth callback from Jira
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { JiraService } from '../../../services/jira-service.js';

const logger = createLogger('JiraCallback');

/**
 * Build the UI base URL for redirects.
 * In dev mode the UI runs on a different port (default 7007) than the server (7008).
 * We derive the UI origin from the Referer header when available, otherwise fall back
 * to the request origin (server URL) which works in production where UI and API
 * are served from the same origin.
 */
function getUiBaseUrl(req: Request): string {
  // 1. Try Referer header
  const referer = req.headers.referer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore invalid referer
    }
  }
  // 2. Try CORS_ORIGIN env var (first entry)
  const corsOrigin = process.env.CORS_ORIGIN?.split(',')[0]?.trim();
  if (corsOrigin) return corsOrigin;
  // 3. Fallback: server origin with port - 1 (UI port convention)
  const host = req.get('host') || 'localhost:7008';
  const [hostname, portStr] = host.split(':');
  const serverPort = parseInt(portStr || '7008', 10);
  return `${req.protocol}://${hostname}:${serverPort - 1}`;
}

export function createCallbackHandler(jiraService: JiraService) {
  return async (req: Request, res: Response) => {
    const uiBase = getUiBaseUrl(req);

    try {
      const { code, state, error, error_description } = req.query;

      // Handle OAuth errors
      if (error) {
        logger.error('OAuth error:', error, error_description);
        return res.redirect(
          `${uiBase}/?jiraError=${encodeURIComponent(String(error_description || error))}`
        );
      }

      if (!code || typeof code !== 'string') {
        return res.redirect(`${uiBase}/?jiraError=missing_code`);
      }

      if (!state || typeof state !== 'string') {
        return res.redirect(`${uiBase}/?jiraError=missing_state`);
      }

      // Validate state
      const stateValidation = jiraService.validateState(state);
      if (!stateValidation.valid) {
        logger.error('Invalid OAuth state');
        return res.redirect(`${uiBase}/?jiraError=invalid_state`);
      }

      // Exchange code for tokens
      const tokens = await jiraService.exchangeCodeForTokens(code);

      // Get accessible resources to find the Jira site
      const resources = await jiraService.getAccessibleResources(tokens.accessToken);

      if (resources.length === 0) {
        return res.redirect(`${uiBase}/?jiraError=no_accessible_sites`);
      }

      // Use the first accessible site (most common case)
      // TODO: If multiple sites, we could prompt the user to choose
      const site = resources[0];

      // Save credentials
      await jiraService.saveJiraCredentials(
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresIn,
        site.id,
        site.url,
        site.name
      );

      // Redirect back to the app (returnUrl is already a full URL from the UI)
      const returnUrl = stateValidation.returnUrl || uiBase;
      const separator = returnUrl.includes('?') ? '&' : '?';
      res.redirect(`${returnUrl}${separator}jiraConnected=true`);
    } catch (error) {
      logger.error('OAuth callback error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during OAuth callback';
      res.redirect(`${uiBase}/?jiraError=${encodeURIComponent(errorMessage)}`);
    }
  };
}
