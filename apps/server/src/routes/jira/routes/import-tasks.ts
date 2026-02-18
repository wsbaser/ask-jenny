/**
 * Jira Import Tasks Route
 *
 * POST /api/jira/import - Import Jira issues as features
 *
 * This endpoint imports selected Jira issues from active sprints as features
 * in AutoMaker. It fetches the issues and creates corresponding features.
 *
 * Request Body:
 * {
 *   projectPath: string;      // Target project path for features
 *   issueKeys: string[];      // Array of Jira issue keys to import (e.g., ["PROJ-123", "PROJ-456"])
 *   options?: {
 *     includeComments?: boolean;      // Include issue comments in feature description (default: false)
 *     includeDependencies?: boolean;  // Map linked issues as feature dependencies (default: false)
 *     skipDuplicates?: boolean;       // Skip issues that already exist as features (default: true)
 *   }
 * }
 *
 * Response format:
 * {
 *   success: boolean;
 *   imported: Array<{
 *     issueKey: string;
 *     featureId: string;
 *     title: string;
 *   }>;
 *   skipped: Array<{
 *     issueKey: string;
 *     reason: string;
 *   }>;
 *   failed: Array<{
 *     issueKey: string;
 *     error: string;
 *   }>;
 *   totalImported: number;
 *   totalSkipped: number;
 *   totalFailed: number;
 *   error?: string;
 * }
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { JiraService } from '../../../services/jira-service.js';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getJiraFeatureMappingService } from '../../../services/jira-feature-mapping-service.js';
import type { JiraConnectionCredentials } from '../../../types/settings.js';
import type { SettingsService } from '../../../services/settings-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import type { JiraIssue, JiraLinkedIssue } from '@automaker/types';

const logger = createLogger('JiraImportTasks');

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Import options for the endpoint
 */
interface ImportOptions {
  includeComments?: boolean;
  includeDependencies?: boolean;
  skipDuplicates?: boolean;
}

/**
 * Request body for import endpoint
 */
interface ImportTasksRequest {
  projectPath: string;
  issueKeys: string[];
  options?: ImportOptions;
}

/**
 * Result for a single imported issue
 */
interface ImportedIssue {
  issueKey: string;
  featureId: string;
  title: string;
}

/**
 * Result for a skipped issue
 */
interface SkippedIssue {
  issueKey: string;
  reason: string;
}

/**
 * Result for a failed import
 */
interface FailedImport {
  issueKey: string;
  error: string;
}

/**
 * Full response structure
 */
interface ImportTasksResponse {
  success: boolean;
  imported: ImportedIssue[];
  skipped: SkippedIssue[];
  failed: FailedImport[];
  totalImported: number;
  totalSkipped: number;
  totalFailed: number;
  error?: string;
}

/**
 * Convert a Jira issue to a feature description
 * Combines issue summary, description, and optionally comments
 */
function buildFeatureDescription(
  issue: JiraIssue,
  includeComments: boolean
): string {
  const parts: string[] = [];

  // Add description if present
  if (issue.description && issue.description.trim()) {
    parts.push(issue.description.trim());
  }

  // Add metadata section
  const metadata: string[] = [];

  if (issue.issueType) {
    metadata.push(`Type: ${issue.issueType.name}`);
  }

  if (issue.priority) {
    metadata.push(`Priority: ${issue.priority.name}`);
  }

  if (issue.storyPoints !== undefined) {
    metadata.push(`Story Points: ${issue.storyPoints}`);
  }

  if (issue.labels && issue.labels.length > 0) {
    metadata.push(`Labels: ${issue.labels.join(', ')}`);
  }

  if (metadata.length > 0) {
    parts.push(`\n---\n**Jira Metadata:**\n${metadata.join('\n')}`);
  }

  // Add comments if requested
  if (includeComments && issue.comments && issue.comments.length > 0) {
    const commentSection = issue.comments
      .slice(0, 5) // Limit to 5 most recent comments
      .map((c) => `> **${c.author.displayName}** (${c.createdAt}):\n> ${c.body}`)
      .join('\n\n');
    parts.push(`\n---\n**Recent Comments:**\n${commentSection}`);
  }

  return parts.join('\n\n') || issue.summary;
}

/**
 * Map priority name to numeric priority value
 */
function mapPriorityToNumber(priorityName?: string): number | undefined {
  if (!priorityName) return undefined;

  const priorityMap: Record<string, number> = {
    'Highest': 1,
    'High': 2,
    'Medium': 3,
    'Low': 4,
    'Lowest': 5,
  };

  return priorityMap[priorityName] ?? undefined;
}

/**
 * Map Jira status to feature status
 */
function mapJiraStatusToFeatureStatus(statusCategory: string): string {
  switch (statusCategory) {
    case 'done':
      return 'completed';
    case 'indeterminate':
      return 'running';
    case 'new':
    default:
      return 'pending';
  }
}

/**
 * Extract dependency feature IDs from linked issues
 * Note: This requires the linked issues to already be imported as features
 */
function extractDependencies(
  linkedIssues: JiraLinkedIssue[] | undefined,
  importedIssueKeyToFeatureId: Map<string, string>
): string[] {
  if (!linkedIssues || linkedIssues.length === 0) {
    return [];
  }

  const dependencies: string[] = [];

  for (const link of linkedIssues) {
    // Only add "blocks" or "is blocked by" type relationships as dependencies
    const isBlockingRelation =
      link.linkType.toLowerCase().includes('block') ||
      link.linkType.toLowerCase().includes('depend');

    if (isBlockingRelation && link.direction === 'inward') {
      // This issue is blocked by the linked issue
      const featureId = importedIssueKeyToFeatureId.get(link.key);
      if (featureId) {
        dependencies.push(featureId);
      }
    }
  }

  return dependencies;
}

/**
 * POST /api/jira/import
 *
 * Import Jira issues as features. This endpoint:
 * 1. Validates the Jira connection is configured
 * 2. Fetches each requested issue from Jira
 * 3. Creates a feature for each issue
 * 4. Returns a summary of imported, skipped, and failed issues
 *
 * @param settingsService - Settings service for reading stored credentials
 * @param featureLoader - Feature loader for creating features
 * @param events - Event emitter for feature events
 */
export function createImportTasksHandler(
  settingsService?: SettingsService,
  featureLoader?: FeatureLoader,
  events?: EventEmitter
) {
  return async (req: Request, res: Response): Promise<void> => {
    const response: ImportTasksResponse = {
      success: false,
      imported: [],
      skipped: [],
      failed: [],
      totalImported: 0,
      totalSkipped: 0,
      totalFailed: 0,
    };

    try {
      // Validate settings service is available
      if (!settingsService) {
        res.status(500).json({
          ...response,
          error: 'Settings service not available',
        });
        return;
      }

      // Validate feature loader is available
      if (!featureLoader) {
        res.status(500).json({
          ...response,
          error: 'Feature loader not available',
        });
        return;
      }

      // Parse and validate request body
      const { projectPath, issueKeys, options = {} } = req.body as ImportTasksRequest;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          ...response,
          error: 'projectPath is required and must be a string',
        });
        return;
      }

      if (!issueKeys || !Array.isArray(issueKeys) || issueKeys.length === 0) {
        res.status(400).json({
          ...response,
          error: 'issueKeys is required and must be a non-empty array',
        });
        return;
      }

      // Validate issue keys format
      const invalidKeys = issueKeys.filter(
        (key) => typeof key !== 'string' || !/^[A-Z]+-\d+$/.test(key)
      );
      if (invalidKeys.length > 0) {
        res.status(400).json({
          ...response,
          error: `Invalid issue key format: ${invalidKeys.join(', ')}. Expected format: PROJECT-123`,
        });
        return;
      }

      const {
        includeComments = false,
        includeDependencies = false,
        skipDuplicates = true,
      } = options;

      // Get stored credentials to check for existing Jira connection
      const credentials = await settingsService.getCredentials();
      const jiraConnections: JiraConnectionCredentials[] =
        (credentials as { jiraConnections?: JiraConnectionCredentials[] }).jiraConnections || [];

      // Find the active Jira connection
      const activeConnection =
        jiraConnections.find((conn: JiraConnectionCredentials) => conn.isActive) ||
        jiraConnections[0];

      if (!activeConnection || !activeConnection.accessToken) {
        res.status(401).json({
          ...response,
          error: 'No Jira connection configured. Use the Jira authentication flow to connect.',
        });
        return;
      }

      // Check if we have cloud ID for OAuth connections
      if (!activeConnection.cloudId) {
        res.status(400).json({
          ...response,
          error: 'Jira Cloud ID not found. Please re-authenticate with Jira.',
        });
        return;
      }

      // Initialize JiraService with the active connection
      const jiraService = new JiraService();
      const host = `https://api.atlassian.com/ex/jira/${activeConnection.cloudId}`;

      await jiraService.initialize({
        host,
        deploymentType: 'cloud',
        authMethod: 'oauth2',
        accessToken: activeConnection.accessToken,
        tokenExpiresAt: activeConnection.tokenExpiresAt,
      });

      logger.info(`Importing ${issueKeys.length} Jira issues for project: ${projectPath}`);

      // Get the mapping service
      const mappingService = getJiraFeatureMappingService();

      // Track imported issue keys to feature IDs for dependency mapping
      const importedIssueKeyToFeatureId = new Map<string, string>();

      // Pre-check for existing mappings if skipping duplicates
      const existingMappings = skipDuplicates
        ? await mappingService.getMappingsByIssueKeys(projectPath, issueKeys)
        : new Map();

      // Process each issue
      for (const issueKey of issueKeys) {
        try {
          // Check for existing mapping first (most reliable duplicate detection)
          if (skipDuplicates && existingMappings.has(issueKey)) {
            const existingMapping = existingMappings.get(issueKey)!;
            response.skipped.push({
              issueKey,
              reason: `Jira issue already mapped to feature ${existingMapping.featureId}`,
            });
            continue;
          }

          // Fetch issue from Jira
          const issue = await jiraService.getIssue(issueKey, {
            includeComments,
            maxComments: 5,
            includeLinks: includeDependencies,
          });

          // Check for duplicates by title if enabled (fallback check)
          if (skipDuplicates) {
            // Check if a feature with this title already exists
            const existingFeature = await featureLoader.findByTitle(projectPath, issue.summary);
            if (existingFeature) {
              response.skipped.push({
                issueKey,
                reason: `Feature with title "${issue.summary}" already exists (ID: ${existingFeature.id})`,
              });
              continue;
            }
          }

          // Build feature data from Jira issue
          const featureDescription = buildFeatureDescription(issue, includeComments);
          const priority = mapPriorityToNumber(issue.priority?.name);
          const status = mapJiraStatusToFeatureStatus(issue.status.statusCategory);

          // Extract dependencies from linked issues (only from previously imported issues in this batch)
          const dependencies = includeDependencies
            ? extractDependencies(issue.linkedIssues, importedIssueKeyToFeatureId)
            : undefined;

          // Create the feature
          const feature = await featureLoader.create(projectPath, {
            title: issue.summary,
            description: featureDescription,
            category: issue.issueType.name || 'Uncategorized',
            priority,
            status,
            dependencies: dependencies && dependencies.length > 0 ? dependencies : undefined,
            // Store Jira metadata for reference
            jiraIssueKey: issue.key,
            jiraIssueUrl: issue.webUrl,
          });

          // Track the mapping in memory for dependency resolution
          importedIssueKeyToFeatureId.set(issueKey, feature.id);

          // Create persistent mapping in the mapping service
          try {
            await mappingService.createMapping(projectPath, {
              jiraIssueKey: issueKey,
              featureId: feature.id,
              syncEnabled: false, // Sync can be enabled later
              syncDirection: 'jira_to_feature',
            });
          } catch (mappingError) {
            // Log but don't fail - the feature was created successfully
            logger.warn(
              `Feature created but mapping failed for ${issueKey}:`,
              mappingError
            );
          }

          response.imported.push({
            issueKey,
            featureId: feature.id,
            title: issue.summary,
          });

          // Emit feature:created event
          if (events) {
            events.emit('feature:created', {
              featureId: feature.id,
              featureName: feature.title,
              projectPath,
              source: 'jira_import',
              jiraIssueKey: issueKey,
            });
          }

          logger.info(`Imported ${issueKey} as feature ${feature.id}`);
        } catch (issueError) {
          const errorMessage = getErrorMessage(issueError);
          logger.error(`Failed to import issue ${issueKey}:`, issueError);
          response.failed.push({
            issueKey,
            error: errorMessage,
          });
        }
      }

      // Update dependency mappings for issues that were imported later in the batch
      // (Their dependencies might have been imported after them)
      if (includeDependencies) {
        for (const imported of response.imported) {
          try {
            const issue = await jiraService.getIssue(imported.issueKey, {
              includeLinks: true,
            });

            const dependencies = extractDependencies(
              issue.linkedIssues,
              importedIssueKeyToFeatureId
            );

            if (dependencies.length > 0) {
              await featureLoader.update(projectPath, imported.featureId, {
                dependencies,
              });
            }
          } catch (updateError) {
            // Log but don't fail - dependencies are optional
            logger.warn(
              `Could not update dependencies for feature ${imported.featureId}:`,
              updateError
            );
          }
        }
      }

      // Compute totals
      response.totalImported = response.imported.length;
      response.totalSkipped = response.skipped.length;
      response.totalFailed = response.failed.length;
      response.success = response.totalImported > 0 || response.totalSkipped > 0;

      logger.info(
        `Import complete: ${response.totalImported} imported, ` +
          `${response.totalSkipped} skipped, ${response.totalFailed} failed`
      );

      res.json(response);
    } catch (error) {
      logger.error('Error importing Jira tasks:', error);
      res.status(500).json({
        ...response,
        error: getErrorMessage(error),
      });
    }
  };
}
