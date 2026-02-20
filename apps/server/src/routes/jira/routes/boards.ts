/**
 * GET /api/jira/boards - Get Jira boards
 */

import type { Request, Response } from 'express';
import type { JiraService } from '../../../services/jira-service.js';

export function createBoardsHandler(jiraService: JiraService) {
  return async (_req: Request, res: Response) => {
    try {
      const boards = await jiraService.getBoards();
      res.json({ boards });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not connected')) {
        return res.status(401).json({ error: 'Not connected to Jira' });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch boards',
      });
    }
  };
}
