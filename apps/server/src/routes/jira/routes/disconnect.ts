/**
 * POST /api/jira/disconnect - Disconnect from Jira
 */

import type { Request, Response } from 'express';
import type { JiraService } from '../../../services/jira-service.js';

export function createDisconnectHandler(jiraService: JiraService) {
  return async (_req: Request, res: Response) => {
    try {
      await jiraService.disconnectJira();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to disconnect from Jira',
      });
    }
  };
}
