/**
 * GET /api/jira/boards - Get Jira boards
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { JiraService } from '../../../services/jira-service.js';

const logger = createLogger('JiraBoards');

export function createBoardsHandler(jiraService: JiraService) {
  return async (_req: Request, res: Response) => {
    try {
      const boards = await jiraService.getBoards();
      res.json({ boards });
    } catch (error) {
      logger.error('Failed to fetch boards:', error);
      if (error instanceof Error && error.message.includes('Not connected')) {
        return res.status(401).json({ error: 'Not connected to Jira' });
      }
      if (
        error instanceof Error &&
        (error.message.includes('API error (401)') || error.message.includes('API error (403)'))
      ) {
        return res.status(401).json({ error: 'Jira authentication expired. Please reconnect.' });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch boards',
      });
    }
  };
}
