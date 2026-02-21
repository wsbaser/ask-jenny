/**
 * POST /api/jira/import - Import Jira issues as features
 */

import type { Request, Response } from 'express';
import * as fs from 'fs/promises';
import { createLogger } from '@automaker/utils';
import type { JiraService } from '../../../services/jira-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type {
  JiraImportRequest,
  JiraImportResponse,
  JiraImportResult,
  FeatureImagePath,
} from '@automaker/types';

const logger = createLogger('JiraImport');

// ============================================================================
// Types
// ============================================================================

/** Issue details passed from frontend for import */
interface IssueDetailsForImport {
  key: string;
  summary: string;
  description?: string;
  url?: string;
  priority?: string;
  issueType?: string;
  storyPoints?: number;
}

/** Extended import request including issue details */
interface ExtendedImportRequest extends JiraImportRequest {
  issues?: IssueDetailsForImport[];
}

// ============================================================================
// Priority Mapping
// ============================================================================

/** Priority levels (0 = highest, 4 = lowest) */
const PRIORITY_LEVELS = {
  HIGHEST: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  LOWEST: 4,
} as const;

/**
 * Map Jira priority name to internal priority level (0-4)
 */
function mapJiraPriorityToLevel(priorityName: string | undefined): number {
  if (!priorityName) {
    return PRIORITY_LEVELS.MEDIUM; // Default
  }

  const priorityLower = priorityName.toLowerCase();

  if (priorityLower.includes('highest') || priorityLower.includes('blocker')) {
    return PRIORITY_LEVELS.HIGHEST;
  }
  if (priorityLower.includes('high') || priorityLower.includes('critical')) {
    return PRIORITY_LEVELS.HIGH;
  }
  if (priorityLower.includes('medium') || priorityLower.includes('normal')) {
    return PRIORITY_LEVELS.MEDIUM;
  }
  if (priorityLower.includes('low')) {
    return PRIORITY_LEVELS.LOW;
  }
  if (priorityLower.includes('lowest') || priorityLower.includes('trivial')) {
    return PRIORITY_LEVELS.LOWEST;
  }

  return PRIORITY_LEVELS.MEDIUM;
}

// ============================================================================
// Jira Key Pattern for Duplicate Detection
// ============================================================================

/** Regex pattern to extract Jira issue key from feature title (e.g., "PROJ-123: ..." ) */
const JIRA_KEY_IN_TITLE_PATTERN = /^([A-Z]+-\d+):?\s/;

/** Regex pattern to extract Jira issue key from feature description */
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

// ============================================================================
// Handler
// ============================================================================

export function createImportIssuesHandler(jiraService: JiraService, featureLoader: FeatureLoader) {
  return async (req: Request<unknown, unknown, ExtendedImportRequest>, res: Response) => {
    try {
      const {
        projectPath,
        issueIds,
        issues: issueDetails,
        defaultCategory = 'Jira Import',
        includeIssueKey = true,
        includeUrl = true,
      } = req.body;

      // Validate required fields
      if (!projectPath) {
        return res.status(400).json({ error: 'projectPath is required' });
      }

      if (!issueIds || issueIds.length === 0) {
        return res.status(400).json({ error: 'issueIds is required and cannot be empty' });
      }

      if (!issueDetails || issueDetails.length === 0) {
        return res.status(400).json({
          error: 'Issue details are required. Include issues array with key, summary, description.',
        });
      }

      // Build set of existing Jira keys for duplicate detection
      const existingFeatures = await featureLoader.getAll(projectPath);
      const existingJiraKeys = new Set<string>();

      for (const feature of existingFeatures) {
        const jiraKey = extractJiraKeyFromFeature(feature);
        if (jiraKey) {
          existingJiraKeys.add(jiraKey);
        }
      }

      // Process each issue
      const results: JiraImportResult[] = [];
      let successful = 0;
      let failed = 0;
      let duplicates = 0;

      for (const issue of issueDetails) {
        // Check for duplicate
        if (existingJiraKeys.has(issue.key)) {
          results.push({
            issueKey: issue.key,
            success: false,
            duplicate: true,
          });
          duplicates++;
          continue;
        }

        // Pre-generate feature ID so images can be written directly to the feature directory
        const featureId = featureLoader.generateFeatureId();
        let imagePaths: FeatureImagePath[] | undefined;

        try {
          // Build feature title
          const title = includeIssueKey ? `${issue.key}: ${issue.summary}` : issue.summary;

          // Build feature description
          let description = issue.description || issue.summary;
          if (includeUrl && issue.url) {
            description = `Jira Issue: [${issue.key}](${issue.url})\n\n${description}`;
          }

          // Map Jira priority to internal priority level
          const priority = mapJiraPriorityToLevel(issue.priority);

          // Download image attachments from Jira (non-fatal)
          try {
            const downloaded = await jiraService.downloadIssueImageAttachments(
              issue.key,
              projectPath,
              featureId
            );
            if (downloaded.length > 0) {
              imagePaths = downloaded;
            }
          } catch (imageError) {
            logger.warn(`Could not download images for ${issue.key}:`, imageError);
          }

          // Create the feature with Jira metadata and downloaded images
          const feature = await featureLoader.create(projectPath, {
            id: featureId,
            title,
            description,
            category: defaultCategory,
            priority,
            status: 'backlog',
            jiraKey: issue.key,
            jiraUrl: issue.url,
            jiraIssueType: issue.issueType,
            jiraStoryPoints: issue.storyPoints,
            imagePaths,
          });

          results.push({
            issueKey: issue.key,
            success: true,
            featureId: feature.id,
          });
          successful++;
          existingJiraKeys.add(issue.key);
        } catch (error) {
          // Clean up pre-written images directory if feature creation failed
          if (imagePaths && imagePaths.length > 0) {
            const featureDir = featureLoader.getFeatureDir(projectPath, featureId);
            await fs.rm(featureDir, { recursive: true, force: true }).catch(() => {});
          }
          logger.error(`Failed to import issue ${issue.key}:`, error);
          results.push({
            issueKey: issue.key,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          failed++;
        }
      }

      const response: JiraImportResponse = {
        total: issueDetails.length,
        successful,
        failed,
        duplicates,
        results,
      };

      res.json(response);
    } catch (error) {
      logger.error('Import error:', error);
      if (error instanceof Error && error.message.includes('Not connected')) {
        return res.status(401).json({ error: 'Not connected to Jira' });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to import issues',
      });
    }
  };
}
