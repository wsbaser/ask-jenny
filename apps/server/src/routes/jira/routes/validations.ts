/**
 * Jira Validations Routes
 *
 * GET /api/jira/validations - List Jira-to-feature mappings for a project
 * GET /api/jira/validations/:issueKey - Get mapping for a specific Jira issue
 *
 * These routes provide access to the Jira-feature mapping data, which tracks
 * which features were imported from which Jira issues.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { getJiraFeatureMappingService } from '../../../services/jira-feature-mapping-service.js';
import type { JiraFeatureMapping } from '@automaker/types';

const logger = createLogger('JiraValidations');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * GET /api/jira/validations
 *
 * List all Jira-to-feature mappings for a project.
 *
 * Query params:
 * - projectPath: Path to the project (required)
 * - issueKey: Filter by specific Jira issue key (optional)
 *
 * Response:
 * {
 *   success: boolean,
 *   validations: JiraFeatureMapping[],
 *   error?: string
 * }
 */
export function createListValidationsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      const issueKey = req.query.issueKey as string | undefined;

      const mappingService = getJiraFeatureMappingService();

      logger.info(
        `Fetching Jira validations for project: ${projectPath}${issueKey ? ` (issue: ${issueKey})` : ''}`
      );

      if (issueKey) {
        // Get single mapping by issue key
        const mapping = await mappingService.getMappingByIssueKey(projectPath, issueKey);

        if (!mapping) {
          res.json({
            success: true,
            validations: [],
          });
          return;
        }

        res.json({
          success: true,
          validations: [mapping],
        });
      } else {
        // Get all mappings
        const mappings = await mappingService.getAllMappings(projectPath);

        logger.info(`Found ${mappings.length} Jira validations`);

        res.json({
          success: true,
          validations: mappings,
        });
      }
    } catch (error) {
      logger.error('Error fetching Jira validations:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * GET /api/jira/validations/:issueKey
 *
 * Get the mapping for a specific Jira issue.
 *
 * Path params:
 * - issueKey: Jira issue key (e.g., "PROJ-123")
 *
 * Query params:
 * - projectPath: Path to the project (required)
 *
 * Response:
 * {
 *   success: boolean,
 *   validation?: JiraFeatureMapping,
 *   exists: boolean,
 *   error?: string
 * }
 */
export function createGetValidationHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { issueKey } = req.params;
      const projectPath = req.query.projectPath as string;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      if (!issueKey) {
        res.status(400).json({
          success: false,
          error: 'issueKey path parameter is required',
        });
        return;
      }

      const mappingService = getJiraFeatureMappingService();

      logger.info(`Fetching Jira validation for issue: ${issueKey}`);

      const mapping = await mappingService.getMappingByIssueKey(projectPath, issueKey);

      if (!mapping) {
        res.json({
          success: true,
          exists: false,
        });
        return;
      }

      res.json({
        success: true,
        exists: true,
        validation: mapping,
      });
    } catch (error) {
      logger.error(`Error fetching Jira validation for issue ${req.params.issueKey}:`, error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * DELETE /api/jira/validations/:issueKey
 *
 * Delete a mapping for a specific Jira issue.
 *
 * Path params:
 * - issueKey: Jira issue key (e.g., "PROJ-123")
 *
 * Query params:
 * - projectPath: Path to the project (required)
 *
 * Response:
 * {
 *   success: boolean,
 *   deleted: boolean,
 *   error?: string
 * }
 */
export function createDeleteValidationHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { issueKey } = req.params;
      const projectPath = req.query.projectPath as string;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      if (!issueKey) {
        res.status(400).json({
          success: false,
          error: 'issueKey path parameter is required',
        });
        return;
      }

      const mappingService = getJiraFeatureMappingService();

      logger.info(`Deleting Jira validation for issue: ${issueKey}`);

      const deleted = await mappingService.deleteMappingByIssueKey(projectPath, issueKey);

      res.json({
        success: true,
        deleted,
      });
    } catch (error) {
      logger.error(`Error deleting Jira validation for issue ${req.params.issueKey}:`, error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
