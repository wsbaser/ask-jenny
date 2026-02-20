/**
 * GET /api/jira/callback - Handle OAuth callback from Jira
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { JiraService } from '../../../services/jira-service.js';

const logger = createLogger('JiraCallback');

export function createCallbackHandler(jiraService: JiraService) {
  return async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;

      // Handle OAuth errors
      if (error) {
        logger.error('OAuth error:', error, error_description);
        return res.redirect(
          `/?jiraError=${encodeURIComponent(String(error_description || error))}`
        );
      }

      if (!code || typeof code !== 'string') {
        return res.redirect('/?jiraError=missing_code');
      }

      if (!state || typeof state !== 'string') {
        return res.redirect('/?jiraError=missing_state');
      }

      // Validate state
      const stateValidation = jiraService.validateState(state);
      if (!stateValidation.valid) {
        logger.error('Invalid OAuth state');
        return res.redirect('/?jiraError=invalid_state');
      }

      // Exchange code for tokens
      const tokens = await jiraService.exchangeCodeForTokens(code);

      // Get accessible resources to find the Jira site
      const resources = await jiraService.getAccessibleResources(tokens.accessToken);

      if (resources.length === 0) {
        return res.redirect('/?jiraError=no_accessible_sites');
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

      // Redirect back to the app
      const returnUrl = stateValidation.returnUrl || '/';
      const separator = returnUrl.includes('?') ? '&' : '?';
      res.redirect(`${returnUrl}${separator}jiraConnected=true`);
    } catch (error) {
      logger.error('OAuth callback error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during OAuth callback';
      res.redirect(`/?jiraError=${encodeURIComponent(errorMessage)}`);
    }
  };
}
