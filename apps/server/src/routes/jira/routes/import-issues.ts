/**
 * POST /api/jira/import - Import Jira issues as features
 */

import type { Request, Response } from 'express';
import * as fs from 'fs/promises';
import { createLogger } from '@ask-jenny/utils';
import type { JiraService } from '../../../services/jira-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type {
  JiraImportRequest,
  JiraImportResponse,
  JiraImportResult,
  FeatureImagePath,
} from '@ask-jenny/types';

const logger = createLogger('JiraImport');

// ============================================================================
// Types
// ============================================================================

/** Subtask details passed from frontend for import */
interface SubtaskDetailsForImport {
  key: string;
  summary: string;
  description?: string;
  url?: string;
  status?: string;
}

/** Issue details passed from frontend for import */
interface IssueDetailsForImport {
  key: string;
  summary: string;
  description?: string;
  url?: string;
  priority?: string;
  issueType?: string;
  storyPoints?: number;
  /** Subtasks (only present for parent issues) */
  subtasks?: SubtaskDetailsForImport[];
  /** Parent key (only present for subtasks) */
  parentKey?: string;
}

/** Extended import request including issue details */
interface ExtendedImportRequest extends JiraImportRequest {
  issues?: IssueDetailsForImport[];
}

/** Import task - represents one feature to create */
interface ImportTask {
  /** The issue key to use for this feature (parent or subtask) */
  issueKey: string;
  /** The issue summary for this feature */
  summary: string;
  /** The issue description for this feature */
  description?: string;
  /** The issue URL */
  url?: string;
  /** Priority name */
  priority?: string;
  /** Issue type name */
  issueType?: string;
  /** Story points */
  storyPoints?: number;
  /** Whether this is a combined import (parent + all subtasks) */
  isCombined: boolean;
  /** For combined imports: array of subtask summaries */
  subtaskSummaries?: string[];
  /** For separate imports: parent issue details to include as context */
  parentContext?: {
    key: string;
    summary: string;
    description?: string;
    url?: string;
  };
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
    return PRIORITY_LEVELS.MEDIUM;
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

/**
 * Extract parent key from a subtask feature title (e.g., "PARENT-123/SUBTASK-124: ..." )
 */
function extractParentKeyFromSubtaskTitle(title: string): string | null {
  const match = title.match(/^([A-Z]+-\d+)\/([A-Z]+-\d+):\s/);
  return match ? match[1] : null;
}

// ============================================================================
// Import Task Generation
// ============================================================================

/**
 * Create an import task for a single issue (no subtasks)
 */
function createSingleIssueTask(issue: IssueDetailsForImport): ImportTask {
  return {
    issueKey: issue.key,
    summary: issue.summary,
    description: issue.description,
    url: issue.url,
    priority: issue.priority,
    issueType: issue.issueType,
    storyPoints: issue.storyPoints,
    isCombined: false,
  };
}

/**
 * Create an import task for a combined feature (parent + all subtasks)
 */
function createCombinedTask(
  issue: IssueDetailsForImport,
  selectedSubtaskKeys: string[]
): ImportTask {
  const subtasksMap = new Map(issue.subtasks!.map((st) => [st.key, st]));
  const selectedSubtasks = selectedSubtaskKeys
    .map((key) => subtasksMap.get(key))
    .filter((st): st is SubtaskDetailsForImport => st !== undefined);

  return {
    issueKey: issue.key,
    summary: issue.summary,
    description: issue.description,
    url: issue.url,
    priority: issue.priority,
    issueType: issue.issueType,
    storyPoints: issue.storyPoints,
    isCombined: true,
    subtaskSummaries: selectedSubtasks.map((st) => st.summary),
  };
}

/**
 * Create import tasks for separate subtask features (each with parent context)
 */
function createSeparateSubtaskTasks(
  issue: IssueDetailsForImport,
  selectedSubtaskKeys: string[]
): ImportTask[] {
  const subtasksMap = new Map(issue.subtasks!.map((st) => [st.key, st]));
  const tasks: ImportTask[] = [];

  for (const subtaskKey of selectedSubtaskKeys) {
    const subtask = subtasksMap.get(subtaskKey);
    if (!subtask) continue;

    tasks.push({
      issueKey: subtaskKey,
      summary: subtask.summary,
      description: subtask.description,
      url: subtask.url,
      priority: issue.priority,
      issueType: subtask.status,
      storyPoints: undefined,
      isCombined: false,
      parentContext: {
        key: issue.key,
        summary: issue.summary,
        description: issue.description,
        url: issue.url,
      },
    });
  }

  return tasks;
}

/**
 * Generate import tasks from the selected issues and subtask selections
 */
function generateImportTasks(
  issueDetails: IssueDetailsForImport[],
  subtaskSelections: Record<string, string[]> = {}
): ImportTask[] {
  const tasks: ImportTask[] = [];

  for (const issue of issueDetails) {
    // Skip subtasks - they are handled through parent selections
    if (issue.parentKey) {
      continue;
    }

    const selectedSubtaskKeys = subtaskSelections[issue.key];
    const hasSubtasks = issue.subtasks && issue.subtasks.length > 0;
    const hasSelections = selectedSubtaskKeys && selectedSubtaskKeys.length > 0;

    // Case 1: No subtasks or no selections -> single feature
    if (!hasSubtasks || !hasSelections) {
      tasks.push(createSingleIssueTask(issue));
      continue;
    }

    // Case 2: All subtasks selected -> one combined feature
    if (selectedSubtaskKeys.length === issue.subtasks!.length) {
      tasks.push(createCombinedTask(issue, selectedSubtaskKeys));
      continue;
    }

    // Case 3: Partial subtasks selected -> separate features with parent context
    tasks.push(...createSeparateSubtaskTasks(issue, selectedSubtaskKeys));
  }

  return tasks;
}

// ============================================================================
// Feature Content Builders
// ============================================================================

/**
 * Build feature description for a combined import (parent + all subtasks)
 */
function buildCombinedDescription(task: ImportTask, includeUrl: boolean): string {
  const baseDescription = task.description || task.summary;
  const urlPrefix =
    includeUrl && task.url ? `**Parent Issue:** [${task.issueKey}](${task.url})\n\n` : '';

  const subtasksList = task.subtaskSummaries?.map((s) => `- ${s}`).join('\n') || '';

  return `${urlPrefix}${baseDescription}\n\n## Subtasks\n\n${subtasksList}`;
}

/**
 * Build feature description for a separate subtask import with parent context
 */
function buildSeparateDescription(task: ImportTask): string {
  const parent = task.parentContext!;

  // Context section
  let description = '## Context\n\n';
  description += `**Parent Issue: [${parent.key}](${parent.url})**\n\n`;
  description += `${parent.summary}\n\n`;

  if (parent.description) {
    description += `${parent.description}\n\n`;
  }

  description += '---\n\n';

  // Implementation scope
  description += `**Subtask: [${task.issueKey}](${task.url})**\n\n`;
  description += task.description || task.summary;

  return description;
}

/**
 * Build feature description for a regular issue import
 */
function buildRegularDescription(task: ImportTask, includeUrl: boolean): string {
  const baseDescription = task.description || task.summary;
  if (includeUrl && task.url) {
    return `Jira Issue: [${task.issueKey}](${task.url})\n\n${baseDescription}`;
  }
  return baseDescription;
}

/**
 * Build feature description for an import task
 */
function buildFeatureDescription(task: ImportTask, includeUrl: boolean): string {
  if (task.isCombined) {
    return buildCombinedDescription(task, includeUrl);
  }

  if (task.parentContext) {
    return buildSeparateDescription(task);
  }

  return buildRegularDescription(task, includeUrl);
}

/**
 * Build feature title for an import task
 */
function buildFeatureTitle(task: ImportTask, includeIssueKey: boolean): string {
  if (task.isCombined) {
    // Combined: [PARENT-123] Parent Issue Title
    return includeIssueKey ? `[${task.issueKey}] ${task.summary}` : task.summary;
  }

  if (task.parentContext) {
    // Separate: PARENT-123/SUBTASK-124: Subtask Title
    return includeIssueKey
      ? `${task.parentContext.key}/${task.issueKey}: ${task.summary}`
      : task.summary;
  }

  // Regular: PROJ-123: Title
  return includeIssueKey ? `${task.issueKey}: ${task.summary}` : task.summary;
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
        subtaskSelections = {},
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
      const existingParentKeys = new Set<string>();

      for (const feature of existingFeatures) {
        const jiraKey = extractJiraKeyFromFeature(feature);
        if (jiraKey) {
          existingJiraKeys.add(jiraKey);

          // Track parent keys from subtask features for duplicate detection
          const parentKey = extractParentKeyFromSubtaskTitle(feature.title || '');
          if (parentKey) {
            existingParentKeys.add(parentKey);
          }
        }
      }

      // Combine keys: if parent imported, subtasks are duplicates
      const allExistingKeys = new Set([...existingJiraKeys, ...existingParentKeys]);

      // Generate import tasks
      const importTasks = generateImportTasks(issueDetails, subtaskSelections);

      // Process each import task
      const results: JiraImportResult[] = [];
      let successful = 0;
      let failed = 0;
      let duplicates = 0;

      for (const task of importTasks) {
        // Check duplicate: for separate tasks, check if parent was imported
        const duplicateKey = task.parentContext ? task.parentContext.key : task.issueKey;

        if (allExistingKeys.has(duplicateKey)) {
          results.push({
            issueKey: task.issueKey,
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
          // Build feature content
          const title = buildFeatureTitle(task, includeIssueKey);
          const description = buildFeatureDescription(task, includeUrl);
          const priority = mapJiraPriorityToLevel(task.priority);

          // Download images from both parent (if separate) and the issue itself
          const imageKeysToDownload: string[] = [task.issueKey];
          if (task.parentContext) {
            imageKeysToDownload.unshift(task.parentContext.key);
          }

          try {
            const allDownloaded: FeatureImagePath[] = [];
            for (const key of imageKeysToDownload) {
              try {
                const downloaded = await jiraService.downloadIssueImageAttachments(
                  key,
                  projectPath,
                  featureId
                );
                allDownloaded.push(...downloaded);
              } catch (imageError) {
                logger.warn(`Could not download images for ${key}:`, imageError);
              }
            }
            if (allDownloaded.length > 0) {
              imagePaths = allDownloaded;
            }
          } catch (imageError) {
            logger.warn(`Could not download images for ${task.issueKey}:`, imageError);
          }

          // Create the feature
          const feature = await featureLoader.create(projectPath, {
            id: featureId,
            title,
            description,
            category: defaultCategory,
            priority,
            status: 'backlog',
            jiraKey: task.issueKey,
            jiraUrl: task.url,
            jiraIssueType: task.issueType,
            jiraStoryPoints: task.storyPoints,
            imagePaths,
          });

          results.push({
            issueKey: task.issueKey,
            success: true,
            featureId: feature.id,
          });
          successful++;
          allExistingKeys.add(task.issueKey);
        } catch (error) {
          // Clean up pre-written images directory if feature creation failed
          if (imagePaths && imagePaths.length > 0) {
            const featureDir = featureLoader.getFeatureDir(projectPath, featureId);
            await fs.rm(featureDir, { recursive: true, force: true }).catch(() => {});
          }
          logger.error(`Failed to import issue ${task.issueKey}:`, error);
          results.push({
            issueKey: task.issueKey,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          failed++;
        }
      }

      const response: JiraImportResponse = {
        total: importTasks.length,
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
