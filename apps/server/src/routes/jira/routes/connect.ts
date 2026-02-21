/**
 * POST /api/jira/connect - Initiate Jira OAuth flow
 */

import type { Request, Response } from 'express';
import type { JiraService } from '../../../services/jira-service.js';

interface ConnectRequest {
  returnUrl?: string;
}

export function createConnectHandler(jiraService: JiraService) {
  return async (req: Request<unknown, unknown, ConnectRequest>, res: Response) => {
    try {
      if (!jiraService.isConfigured()) {
        return res.status(501).json({
          error: 'Jira integration is not configured',
          message:
            'Set JIRA_CLIENT_ID and JIRA_CLIENT_SECRET environment variables to enable Jira integration.',
        });
      }

      const { returnUrl } = req.body || {};
      const { url, state } = jiraService.getAuthorizationUrl(returnUrl);

      res.json({
        authorizationUrl: url,
        state,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to initiate Jira connection',
      });
    }
  };
}
