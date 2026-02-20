/**
 * GET /api/jira/boards/:boardId/sprints - Get sprints for a board
 */

import type { Request, Response } from 'express';
import type { JiraService } from '../../../services/jira-service.js';

interface SprintsParams {
  boardId: string;
}

interface SprintsQuery {
  state?: 'active' | 'future' | 'closed';
}

export function createSprintsHandler(jiraService: JiraService) {
  return async (req: Request<SprintsParams, unknown, unknown, SprintsQuery>, res: Response) => {
    try {
      const boardId = parseInt(req.params.boardId, 10);
      if (isNaN(boardId)) {
        return res.status(400).json({ error: 'Invalid board ID' });
      }

      const { state } = req.query;
      const sprints = await jiraService.getSprints(boardId, state);
      res.json({ sprints });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not connected')) {
        return res.status(401).json({ error: 'Not connected to Jira' });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch sprints',
      });
    }
  };
}
