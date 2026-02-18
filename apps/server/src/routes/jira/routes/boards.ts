/**
 * Jira Boards and Sprints Routes
 *
 * GET /api/jira/boards - List Jira boards
 * GET /api/jira/boards/:boardId/sprints - List sprints for a board
 * GET /api/jira/sprints/:sprintId/issues - Get issues in a sprint
 *
 * These routes provide access to Jira Agile boards and sprint functionality.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../../services/settings-service.js';
import { initializeJiraService } from './projects.js';

const logger = createLogger('JiraBoards');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * GET /api/jira/boards
 *
 * List Jira boards, optionally filtered by project.
 *
 * Query params:
 * - projectKey: Filter by project key (optional)
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createListBoardsHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      const { service, error } = await initializeJiraService(settingsService);
      if (error) {
        res.status(401).json({
          success: false,
          error,
        });
        return;
      }

      const projectKey = req.query.projectKey as string | undefined;

      logger.info(`Fetching Jira boards${projectKey ? ` for project ${projectKey}` : ''}`);

      const boards = await service.getBoards(projectKey);

      logger.info(`Found ${boards.length} Jira boards`);

      res.json({
        success: true,
        boards,
      });
    } catch (error) {
      logger.error('Error fetching Jira boards:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * GET /api/jira/boards/:boardId/sprints
 *
 * List sprints for a board.
 *
 * Path params:
 * - boardId: Jira board ID
 *
 * Query params:
 * - state: Sprint state filter ('active', 'future', 'closed')
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createListSprintsHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      const { service, error } = await initializeJiraService(settingsService);
      if (error) {
        res.status(401).json({
          success: false,
          error,
        });
        return;
      }

      const boardId = parseInt(req.params.boardId, 10);

      if (isNaN(boardId) || boardId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid board ID. Must be a positive integer.',
        });
        return;
      }

      const state = req.query.state as 'active' | 'future' | 'closed' | undefined;

      // Validate state parameter if provided
      if (state && !['active', 'future', 'closed'].includes(state)) {
        res.status(400).json({
          success: false,
          error: "Invalid state parameter. Must be 'active', 'future', or 'closed'.",
        });
        return;
      }

      logger.info(`Fetching sprints for board ${boardId}${state ? ` (state: ${state})` : ''}`);

      const sprints = await service.getSprints(boardId, state);

      logger.info(`Found ${sprints.length} sprints for board ${boardId}`);

      res.json({
        success: true,
        sprints,
      });
    } catch (error) {
      logger.error(`Error fetching sprints for board ${req.params.boardId}:`, error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * GET /api/jira/sprints/:sprintId/issues
 *
 * Get issues in a sprint.
 *
 * Path params:
 * - sprintId: Jira sprint ID
 *
 * Query params:
 * - startAt: Pagination start index (default: 0)
 * - maxResults: Maximum results (default: 50)
 *
 * @param settingsService - Settings service for reading stored credentials
 */
export function createGetSprintIssuesHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (!settingsService) {
        res.status(500).json({
          success: false,
          error: 'Settings service not available',
        });
        return;
      }

      const { service, error } = await initializeJiraService(settingsService);
      if (error) {
        res.status(401).json({
          success: false,
          error,
        });
        return;
      }

      const sprintId = parseInt(req.params.sprintId, 10);

      if (isNaN(sprintId) || sprintId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid sprint ID. Must be a positive integer.',
        });
        return;
      }

      const startAt = parseInt(req.query.startAt as string) || 0;
      const maxResults = parseInt(req.query.maxResults as string) || 50;

      logger.info(`Fetching issues for sprint ${sprintId}`);

      const result = await service.getSprintIssues(sprintId, {
        startAt,
        maxResults,
      });

      logger.info(`Found ${result.issues.length} issues in sprint ${sprintId}`);

      res.json({
        success: true,
        issues: result.issues,
        total: result.total,
        startAt: result.startAt,
        maxResults: result.maxResults,
        hasMore: result.hasMore,
      });
    } catch (error) {
      logger.error(`Error fetching issues for sprint ${req.params.sprintId}:`, error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
