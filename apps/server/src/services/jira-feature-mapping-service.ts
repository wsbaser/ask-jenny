/**
 * Jira Feature Mapping Service
 *
 * Manages the bidirectional mapping between Jira issues and AutoMaker features.
 * Provides functionality to:
 * - Create mappings when features are imported from Jira
 * - Query mappings by Jira issue key or feature ID
 * - Update sync status and timestamps
 * - Remove mappings when features are deleted
 *
 * Mappings are stored per-project in {projectPath}/.automaker/jira-mappings/index.json
 */

import {
  createLogger,
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
} from '@automaker/utils';
import {
  getJiraMappingsIndexPath,
  ensureJiraMappingsDir,
} from '@automaker/platform';
import type { JiraFeatureMapping, JiraIssue, Feature } from '@automaker/types';

const logger = createLogger('JiraFeatureMappingService');

/**
 * Version for the mappings index file format
 */
export const JIRA_MAPPINGS_VERSION = 1;

/**
 * Index file structure for Jira mappings
 */
interface JiraMappingsIndex {
  version: number;
  mappings: JiraFeatureMapping[];
}

/**
 * Default empty index
 */
const DEFAULT_JIRA_MAPPINGS_INDEX: JiraMappingsIndex = {
  version: JIRA_MAPPINGS_VERSION,
  mappings: [],
};

/**
 * Options for creating a new mapping
 */
export interface CreateMappingOptions {
  /** Jira issue key (e.g., "PROJ-123") */
  jiraIssueKey: string;
  /** AutoMaker feature ID */
  featureId: string;
  /** Whether to enable sync for this mapping */
  syncEnabled?: boolean;
  /** Sync direction */
  syncDirection?: JiraFeatureMapping['syncDirection'];
}

/**
 * Options for updating an existing mapping
 */
export interface UpdateMappingOptions {
  /** Whether sync is enabled */
  syncEnabled?: boolean;
  /** Sync direction */
  syncDirection?: JiraFeatureMapping['syncDirection'];
  /** Last sync timestamp (ISO string) */
  lastSyncedAt?: string;
}

/**
 * Result from a bulk mapping operation
 */
export interface BulkMappingResult {
  /** Successfully created mappings */
  created: JiraFeatureMapping[];
  /** Mappings that already existed (skipped) */
  skipped: Array<{ jiraIssueKey: string; reason: string }>;
  /** Mappings that failed to create */
  failed: Array<{ jiraIssueKey: string; error: string }>;
}

/**
 * JiraFeatureMappingService - Manages Jira issue to Feature mappings
 *
 * This service provides a persistent mapping layer between Jira issues
 * and AutoMaker features. It enables:
 * - Tracking which features were imported from which Jira issues
 * - Preventing duplicate imports
 * - Supporting future sync functionality
 */
export class JiraFeatureMappingService {
  /**
   * Get all mappings for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Array of all mappings
   */
  async getAllMappings(projectPath: string): Promise<JiraFeatureMapping[]> {
    const index = await this.loadIndex(projectPath);
    return index.mappings;
  }

  /**
   * Get a mapping by Jira issue key
   *
   * @param projectPath - Absolute path to project directory
   * @param jiraIssueKey - Jira issue key (e.g., "PROJ-123")
   * @returns The mapping if found, null otherwise
   */
  async getMappingByIssueKey(
    projectPath: string,
    jiraIssueKey: string
  ): Promise<JiraFeatureMapping | null> {
    const index = await this.loadIndex(projectPath);
    const mapping = index.mappings.find(
      (m) => m.jiraIssueKey.toLowerCase() === jiraIssueKey.toLowerCase()
    );
    return mapping || null;
  }

  /**
   * Get a mapping by feature ID
   *
   * @param projectPath - Absolute path to project directory
   * @param featureId - AutoMaker feature ID
   * @returns The mapping if found, null otherwise
   */
  async getMappingByFeatureId(
    projectPath: string,
    featureId: string
  ): Promise<JiraFeatureMapping | null> {
    const index = await this.loadIndex(projectPath);
    const mapping = index.mappings.find((m) => m.featureId === featureId);
    return mapping || null;
  }

  /**
   * Get multiple mappings by Jira issue keys
   *
   * @param projectPath - Absolute path to project directory
   * @param jiraIssueKeys - Array of Jira issue keys
   * @returns Map of issue key to mapping (for found mappings)
   */
  async getMappingsByIssueKeys(
    projectPath: string,
    jiraIssueKeys: string[]
  ): Promise<Map<string, JiraFeatureMapping>> {
    const index = await this.loadIndex(projectPath);
    const result = new Map<string, JiraFeatureMapping>();

    const normalizedKeys = new Set(jiraIssueKeys.map((k) => k.toLowerCase()));

    for (const mapping of index.mappings) {
      if (normalizedKeys.has(mapping.jiraIssueKey.toLowerCase())) {
        result.set(mapping.jiraIssueKey, mapping);
      }
    }

    return result;
  }

  /**
   * Get multiple mappings by feature IDs
   *
   * @param projectPath - Absolute path to project directory
   * @param featureIds - Array of feature IDs
   * @returns Map of feature ID to mapping (for found mappings)
   */
  async getMappingsByFeatureIds(
    projectPath: string,
    featureIds: string[]
  ): Promise<Map<string, JiraFeatureMapping>> {
    const index = await this.loadIndex(projectPath);
    const result = new Map<string, JiraFeatureMapping>();

    const featureIdSet = new Set(featureIds);

    for (const mapping of index.mappings) {
      if (featureIdSet.has(mapping.featureId)) {
        result.set(mapping.featureId, mapping);
      }
    }

    return result;
  }

  /**
   * Create a new mapping between a Jira issue and a feature
   *
   * @param projectPath - Absolute path to project directory
   * @param options - Mapping creation options
   * @returns The created mapping
   * @throws Error if mapping already exists for the issue key
   */
  async createMapping(
    projectPath: string,
    options: CreateMappingOptions
  ): Promise<JiraFeatureMapping> {
    const index = await this.loadIndex(projectPath);

    // Check for existing mapping
    const existingByIssue = index.mappings.find(
      (m) => m.jiraIssueKey.toLowerCase() === options.jiraIssueKey.toLowerCase()
    );
    if (existingByIssue) {
      throw new Error(
        `Mapping already exists for Jira issue ${options.jiraIssueKey} (mapped to feature ${existingByIssue.featureId})`
      );
    }

    const existingByFeature = index.mappings.find(
      (m) => m.featureId === options.featureId
    );
    if (existingByFeature) {
      throw new Error(
        `Feature ${options.featureId} is already mapped to Jira issue ${existingByFeature.jiraIssueKey}`
      );
    }

    const mapping: JiraFeatureMapping = {
      jiraIssueKey: options.jiraIssueKey,
      featureId: options.featureId,
      createdAt: new Date().toISOString(),
      syncEnabled: options.syncEnabled ?? false,
      syncDirection: options.syncDirection ?? 'jira_to_feature',
    };

    index.mappings.push(mapping);
    await this.saveIndex(projectPath, index);

    logger.info(
      `Created mapping: ${options.jiraIssueKey} -> ${options.featureId}`
    );
    return mapping;
  }

  /**
   * Create a mapping from a Jira issue and feature (convenience method)
   *
   * @param projectPath - Absolute path to project directory
   * @param issue - Jira issue
   * @param feature - AutoMaker feature
   * @param syncEnabled - Whether to enable sync
   * @returns The created mapping
   */
  async createMappingFromIssueAndFeature(
    projectPath: string,
    issue: JiraIssue,
    feature: Feature,
    syncEnabled = false
  ): Promise<JiraFeatureMapping> {
    return this.createMapping(projectPath, {
      jiraIssueKey: issue.key,
      featureId: feature.id,
      syncEnabled,
      syncDirection: 'jira_to_feature',
    });
  }

  /**
   * Create multiple mappings at once
   *
   * @param projectPath - Absolute path to project directory
   * @param mappings - Array of mapping options
   * @returns Bulk operation result
   */
  async createMappingsBulk(
    projectPath: string,
    mappings: CreateMappingOptions[]
  ): Promise<BulkMappingResult> {
    const result: BulkMappingResult = {
      created: [],
      skipped: [],
      failed: [],
    };

    const index = await this.loadIndex(projectPath);

    // Build lookup sets for existing mappings
    const existingIssueKeys = new Set(
      index.mappings.map((m) => m.jiraIssueKey.toLowerCase())
    );
    const existingFeatureIds = new Set(index.mappings.map((m) => m.featureId));

    for (const options of mappings) {
      // Check for existing mapping by issue key
      if (existingIssueKeys.has(options.jiraIssueKey.toLowerCase())) {
        result.skipped.push({
          jiraIssueKey: options.jiraIssueKey,
          reason: `Mapping already exists for Jira issue ${options.jiraIssueKey}`,
        });
        continue;
      }

      // Check for existing mapping by feature ID
      if (existingFeatureIds.has(options.featureId)) {
        result.skipped.push({
          jiraIssueKey: options.jiraIssueKey,
          reason: `Feature ${options.featureId} is already mapped to another Jira issue`,
        });
        continue;
      }

      try {
        const mapping: JiraFeatureMapping = {
          jiraIssueKey: options.jiraIssueKey,
          featureId: options.featureId,
          createdAt: new Date().toISOString(),
          syncEnabled: options.syncEnabled ?? false,
          syncDirection: options.syncDirection ?? 'jira_to_feature',
        };

        index.mappings.push(mapping);
        existingIssueKeys.add(options.jiraIssueKey.toLowerCase());
        existingFeatureIds.add(options.featureId);
        result.created.push(mapping);
      } catch (error) {
        result.failed.push({
          jiraIssueKey: options.jiraIssueKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Save once after all mappings are processed
    if (result.created.length > 0) {
      await this.saveIndex(projectPath, index);
      logger.info(`Created ${result.created.length} mappings in bulk`);
    }

    return result;
  }

  /**
   * Update an existing mapping
   *
   * @param projectPath - Absolute path to project directory
   * @param jiraIssueKey - Jira issue key to update
   * @param updates - Fields to update
   * @returns The updated mapping
   * @throws Error if mapping not found
   */
  async updateMapping(
    projectPath: string,
    jiraIssueKey: string,
    updates: UpdateMappingOptions
  ): Promise<JiraFeatureMapping> {
    const index = await this.loadIndex(projectPath);

    const mappingIndex = index.mappings.findIndex(
      (m) => m.jiraIssueKey.toLowerCase() === jiraIssueKey.toLowerCase()
    );

    if (mappingIndex === -1) {
      throw new Error(`No mapping found for Jira issue ${jiraIssueKey}`);
    }

    const mapping = index.mappings[mappingIndex];

    // Apply updates
    if (updates.syncEnabled !== undefined) {
      mapping.syncEnabled = updates.syncEnabled;
    }
    if (updates.syncDirection !== undefined) {
      mapping.syncDirection = updates.syncDirection;
    }
    if (updates.lastSyncedAt !== undefined) {
      mapping.lastSyncedAt = updates.lastSyncedAt;
    }

    index.mappings[mappingIndex] = mapping;
    await this.saveIndex(projectPath, index);

    logger.info(`Updated mapping for ${jiraIssueKey}`);
    return mapping;
  }

  /**
   * Update the last synced timestamp for a mapping
   *
   * @param projectPath - Absolute path to project directory
   * @param jiraIssueKey - Jira issue key
   * @returns The updated mapping
   */
  async updateLastSyncedAt(
    projectPath: string,
    jiraIssueKey: string
  ): Promise<JiraFeatureMapping> {
    return this.updateMapping(projectPath, jiraIssueKey, {
      lastSyncedAt: new Date().toISOString(),
    });
  }

  /**
   * Delete a mapping by Jira issue key
   *
   * @param projectPath - Absolute path to project directory
   * @param jiraIssueKey - Jira issue key
   * @returns True if mapping was deleted, false if not found
   */
  async deleteMappingByIssueKey(
    projectPath: string,
    jiraIssueKey: string
  ): Promise<boolean> {
    const index = await this.loadIndex(projectPath);

    const initialLength = index.mappings.length;
    index.mappings = index.mappings.filter(
      (m) => m.jiraIssueKey.toLowerCase() !== jiraIssueKey.toLowerCase()
    );

    if (index.mappings.length < initialLength) {
      await this.saveIndex(projectPath, index);
      logger.info(`Deleted mapping for Jira issue ${jiraIssueKey}`);
      return true;
    }

    return false;
  }

  /**
   * Delete a mapping by feature ID
   *
   * @param projectPath - Absolute path to project directory
   * @param featureId - Feature ID
   * @returns True if mapping was deleted, false if not found
   */
  async deleteMappingByFeatureId(
    projectPath: string,
    featureId: string
  ): Promise<boolean> {
    const index = await this.loadIndex(projectPath);

    const initialLength = index.mappings.length;
    index.mappings = index.mappings.filter((m) => m.featureId !== featureId);

    if (index.mappings.length < initialLength) {
      await this.saveIndex(projectPath, index);
      logger.info(`Deleted mapping for feature ${featureId}`);
      return true;
    }

    return false;
  }

  /**
   * Delete multiple mappings by feature IDs
   *
   * @param projectPath - Absolute path to project directory
   * @param featureIds - Array of feature IDs
   * @returns Number of mappings deleted
   */
  async deleteMappingsByFeatureIds(
    projectPath: string,
    featureIds: string[]
  ): Promise<number> {
    const index = await this.loadIndex(projectPath);

    const featureIdSet = new Set(featureIds);
    const initialLength = index.mappings.length;
    index.mappings = index.mappings.filter(
      (m) => !featureIdSet.has(m.featureId)
    );

    const deletedCount = initialLength - index.mappings.length;

    if (deletedCount > 0) {
      await this.saveIndex(projectPath, index);
      logger.info(`Deleted ${deletedCount} mappings for features`);
    }

    return deletedCount;
  }

  /**
   * Check if a Jira issue is already mapped to a feature
   *
   * @param projectPath - Absolute path to project directory
   * @param jiraIssueKey - Jira issue key
   * @returns True if mapping exists
   */
  async hasMapping(projectPath: string, jiraIssueKey: string): Promise<boolean> {
    const mapping = await this.getMappingByIssueKey(projectPath, jiraIssueKey);
    return mapping !== null;
  }

  /**
   * Check if a feature is mapped to a Jira issue
   *
   * @param projectPath - Absolute path to project directory
   * @param featureId - Feature ID
   * @returns True if mapping exists
   */
  async featureHasMapping(
    projectPath: string,
    featureId: string
  ): Promise<boolean> {
    const mapping = await this.getMappingByFeatureId(projectPath, featureId);
    return mapping !== null;
  }

  /**
   * Get all mappings with sync enabled
   *
   * @param projectPath - Absolute path to project directory
   * @returns Array of mappings with sync enabled
   */
  async getSyncEnabledMappings(
    projectPath: string
  ): Promise<JiraFeatureMapping[]> {
    const index = await this.loadIndex(projectPath);
    return index.mappings.filter((m) => m.syncEnabled);
  }

  /**
   * Get mappings that haven't been synced recently
   *
   * @param projectPath - Absolute path to project directory
   * @param olderThanMs - Milliseconds since last sync (default: 1 hour)
   * @returns Array of stale mappings
   */
  async getStaleMappings(
    projectPath: string,
    olderThanMs = 60 * 60 * 1000
  ): Promise<JiraFeatureMapping[]> {
    const index = await this.loadIndex(projectPath);
    const now = Date.now();

    return index.mappings.filter((m) => {
      if (!m.syncEnabled) return false;
      if (!m.lastSyncedAt) return true;

      const lastSyncTime = new Date(m.lastSyncedAt).getTime();
      return now - lastSyncTime > olderThanMs;
    });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Load the mappings index from disk
   */
  private async loadIndex(projectPath: string): Promise<JiraMappingsIndex> {
    const indexPath = getJiraMappingsIndexPath(projectPath);

    const result = await readJsonWithRecovery<JiraMappingsIndex>(
      indexPath,
      DEFAULT_JIRA_MAPPINGS_INDEX,
      {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      }
    );

    logRecoveryWarning(result, 'Jira mappings index', logger);

    // Handle version migration if needed in the future
    const index = result.data;
    if (!index.version) {
      index.version = JIRA_MAPPINGS_VERSION;
    }
    if (!index.mappings) {
      index.mappings = [];
    }

    return index;
  }

  /**
   * Save the mappings index to disk
   */
  private async saveIndex(
    projectPath: string,
    index: JiraMappingsIndex
  ): Promise<void> {
    await ensureJiraMappingsDir(projectPath);
    const indexPath = getJiraMappingsIndexPath(projectPath);
    await atomicWriteJson(indexPath, index, { backupCount: DEFAULT_BACKUP_COUNT });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let serviceInstance: JiraFeatureMappingService | null = null;

/**
 * Get the singleton Jira feature mapping service instance
 */
export function getJiraFeatureMappingService(): JiraFeatureMappingService {
  if (!serviceInstance) {
    serviceInstance = new JiraFeatureMappingService();
  }
  return serviceInstance;
}

/**
 * Create a new Jira feature mapping service instance (useful for testing)
 */
export function createJiraFeatureMappingService(): JiraFeatureMappingService {
  return new JiraFeatureMappingService();
}
