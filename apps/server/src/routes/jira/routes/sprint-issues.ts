/**
 * POST /api/jira/sprint-issues - Get issues from a sprint
 */

import type { Request, Response } from 'express';
import { createLogger } from '@ask-jenny/utils';
import type { JiraService } from '../../../services/jira-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { JiraSprintIssuesRequest } from '@ask-jenny/types';

const logger = createLogger('JiraSprintIssues');

/**
 * Regex pattern to extract Jira issue key from feature title (e.g., "PROJ-123: ..." )
 */
const JIRA_KEY_IN_TITLE_PATTERN = /^([A-Z]+-\d+):?\s/;

/**
 * Regex pattern to extract Jira issue key from feature description
 */
const JIRA_KEY_IN_DESCRIPTION_PATTERN = /Jira Issue:\s*\[([A-Z]+-\d+)\]/;

/**
 * Extract Jira key from a feature's title or description
 */
function extractJiraKeyFromFeature(feature: {
  title?: string;
  description?: string;
}): string | null {
  const titleMatch = feature.title?.match(JIRA_KEY_IN_TITLE_PATTERN);
  if (titleMatch) {
    return titleMatch[1];
  }

  const descriptionMatch = feature.description?.match(JIRA_KEY_IN_DESCRIPTION_PATTERN);
  if (descriptionMatch) {
    return descriptionMatch[1];
  }

  return null;
}

/**
 * Extract parent key from a subtask feature title (e.g., "PARENT-123/SUBTASK-124: ..." )
 */
function extractParentKeyFromSubtaskTitle(title: string): string | null {
  const match = title.match(/^([A-Z]+-\d+)\/([A-Z]+-\d+):\s/);
  if (match) {
    return match[1]; // Return parent key
  }
  return null;
}

export function createSprintIssuesHandler(jiraService: JiraService, featureLoader: FeatureLoader) {
  return async (req: Request<unknown, unknown, JiraSprintIssuesRequest>, res: Response) => {
    try {
      const { projectPath, boardId, sprintId, statusFilter, maxResults } = req.body ?? {};

      if (!projectPath) {
        return res.status(400).json({ error: 'projectPath is required' });
      }

      // Fetch existing features to build set of imported Jira keys
      const importedIssueKeys = new Set<string>();
      try {
        const existingFeatures = await featureLoader.getAll(projectPath);
        for (const feature of existingFeatures) {
          const jiraKey = extractJiraKeyFromFeature(feature);
          if (jiraKey) {
            importedIssueKeys.add(jiraKey);

            // Also track parent keys from subtask features for duplicate detection
            const parentKey = extractParentKeyFromSubtaskTitle(feature.title || '');
            if (parentKey) {
              importedIssueKeys.add(parentKey);
            }
          }
        }
      } catch (error) {
        // Non-fatal: log error but continue without imported keys
        logger.warn('Failed to fetch existing features for duplicate detection:', error);
      }

      const result = await jiraService.getSprintIssuesForProject({
        boardId,
        sprintId,
        statusFilter,
        maxResults,
        importedIssueKeys,
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
