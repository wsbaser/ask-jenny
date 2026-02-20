/**
 * POST /api/jira/sprint-issues - Get issues from a sprint
 */

import type { Request, Response } from 'express';
import type { JiraService } from '../../../services/jira-service.js';
import type { JiraSprintIssuesRequest } from '@automaker/types';

export function createSprintIssuesHandler(jiraService: JiraService) {
  return async (req: Request<unknown, unknown, JiraSprintIssuesRequest>, res: Response) => {
    try {
      const { boardId, sprintId, statusFilter, maxResults } = req.body;

      const result = await jiraService.getSprintIssuesForProject({
        boardId,
        sprintId,
        statusFilter,
        maxResults,
      });

      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not connected')) {
        return res.status(401).json({ error: 'Not connected to Jira' });
      }
      if (error instanceof Error && error.message.includes('No Scrum board')) {
        return res.status(404).json({ error: error.message });
      }
      if (error instanceof Error && error.message.includes('No active sprint')) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch sprint issues',
      });
    }
  };
}
