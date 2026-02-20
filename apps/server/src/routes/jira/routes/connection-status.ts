/**
 * GET /api/jira/status - Get Jira connection status
 */

import type { Request, Response } from 'express';
import type { JiraService } from '../../../services/jira-service.js';

export function createConnectionStatusHandler(jiraService: JiraService) {
  return async (_req: Request, res: Response) => {
    try {
      const status = await jiraService.getConnectionStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
