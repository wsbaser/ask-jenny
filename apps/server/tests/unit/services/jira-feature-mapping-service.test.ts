/**
 * Unit tests for JiraFeatureMappingService
 *
 * Tests the bidirectional mapping between Jira issues and AutoMaker features.
 * Uses unique temp directories and unique keys per test to ensure isolation.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  JiraFeatureMappingService,
  createJiraFeatureMappingService,
  JIRA_MAPPINGS_VERSION,
} from '@/services/jira-feature-mapping-service.js';
import type { JiraIssue, Feature } from '@automaker/types';

/**
 * Generate a unique test ID for each test to ensure complete isolation.
 * Uses crypto.randomUUID() for maximum uniqueness.
 */
function uniqueId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Create a unique temp directory for a test
 */
async function createUniqueTestDir(): Promise<string> {
  const testDir = path.join(os.tmpdir(), `jira-mapping-test-${uniqueId()}`);
  await fs.mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * Clean up a test directory
 */
async function cleanupTestDir(testDir: string): Promise<void> {
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
}

describe('jira-feature-mapping-service', () => {
  // Helper to create a mock Jira issue with unique key
  const createMockIssue = (baseKey: string): JiraIssue => {
    const key = `${baseKey}-${uniqueId()}`;
    return {
      id: `issue-${key}`,
      key,
      summary: `Test issue ${key}`,
      description: 'Test description',
      issueType: { id: '1', name: 'Story', subtask: false },
      status: { id: '1', name: 'To Do', statusCategory: 'new' },
      labels: [],
      components: [],
      fixVersions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // Helper to create a mock feature with unique ID
  const createMockFeature = (baseId: string): Feature => {
    const id = `${baseId}-${uniqueId()}`;
    return {
      id,
      name: `Feature ${id}`,
      status: 'backlog',
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  describe('service creation', () => {
    it('should create a service instance with createJiraFeatureMappingService', () => {
      const service = createJiraFeatureMappingService();
      expect(service).toBeInstanceOf(JiraFeatureMappingService);
    });

    it('should create a service instance with new JiraFeatureMappingService', () => {
      const service = new JiraFeatureMappingService();
      expect(service).toBeInstanceOf(JiraFeatureMappingService);
    });
  });

  describe('JIRA_MAPPINGS_VERSION', () => {
    it('should export version constant', () => {
      expect(JIRA_MAPPINGS_VERSION).toBe(1);
    });
  });

  describe('getAllMappings', () => {
    it('should return empty array when no mappings exist', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const mappings = await service.getAllMappings(testDir);
        expect(mappings).toEqual([]);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should return mappings after creating them', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key1 = `PROJ-${uniqueId()}`;
        const key2 = `PROJ-${uniqueId()}`;
        const feature1 = `feature-${uniqueId()}`;
        const feature2 = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: key1,
          featureId: feature1,
        });
        await service.createMapping(testDir, {
          jiraIssueKey: key2,
          featureId: feature2,
        });

        const mappings = await service.getAllMappings(testDir);
        expect(mappings).toHaveLength(2);
        expect(mappings.map((m) => m.jiraIssueKey)).toContain(key1);
        expect(mappings.map((m) => m.jiraIssueKey)).toContain(key2);
      } finally {
        await cleanupTestDir(testDir);
      }
    });
  });

  describe('getMappingByIssueKey', () => {
    it('should return null when mapping does not exist', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const mapping = await service.getMappingByIssueKey(testDir, `PROJ-${uniqueId()}`);
        expect(mapping).toBeNull();
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should return mapping when it exists', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;
        const featureId = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: key,
          featureId,
        });

        const mapping = await service.getMappingByIssueKey(testDir, key);
        expect(mapping).not.toBeNull();
        expect(mapping?.jiraIssueKey).toBe(key);
        expect(mapping?.featureId).toBe(featureId);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should be case-insensitive for issue keys', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const keyUpper = `PROJ-${uniqueId()}`;
        const keyLower = keyUpper.toLowerCase();
        const featureId = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: keyUpper,
          featureId,
        });

        const mapping = await service.getMappingByIssueKey(testDir, keyLower);
        expect(mapping).not.toBeNull();
        expect(mapping?.jiraIssueKey).toBe(keyUpper);
      } finally {
        await cleanupTestDir(testDir);
      }
    });
  });

  describe('getMappingByFeatureId', () => {
    it('should return null when mapping does not exist', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const mapping = await service.getMappingByFeatureId(testDir, `feature-${uniqueId()}`);
        expect(mapping).toBeNull();
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should return mapping when it exists', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;
        const featureId = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: key,
          featureId,
        });

        const mapping = await service.getMappingByFeatureId(testDir, featureId);
        expect(mapping).not.toBeNull();
        expect(mapping?.featureId).toBe(featureId);
        expect(mapping?.jiraIssueKey).toBe(key);
      } finally {
        await cleanupTestDir(testDir);
      }
    });
  });

  describe('createMapping', () => {
    it('should create a new mapping with required fields', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;
        const featureId = `feature-${uniqueId()}`;

        const mapping = await service.createMapping(testDir, {
          jiraIssueKey: key,
          featureId,
        });

        expect(mapping.jiraIssueKey).toBe(key);
        expect(mapping.featureId).toBe(featureId);
        expect(mapping.createdAt).toBeDefined();
        expect(mapping.syncEnabled).toBe(false);
        expect(mapping.syncDirection).toBe('jira_to_feature');
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should create mapping with sync enabled', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;
        const featureId = `feature-${uniqueId()}`;

        const mapping = await service.createMapping(testDir, {
          jiraIssueKey: key,
          featureId,
          syncEnabled: true,
        });

        expect(mapping.syncEnabled).toBe(true);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should throw error if mapping already exists for issue key', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;
        const featureId1 = `feature-${uniqueId()}`;
        const featureId2 = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: key,
          featureId: featureId1,
        });

        await expect(
          service.createMapping(testDir, {
            jiraIssueKey: key,
            featureId: featureId2,
          })
        ).rejects.toThrow(`Mapping already exists for Jira issue ${key}`);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should throw error if feature is already mapped', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key1 = `PROJ-${uniqueId()}`;
        const key2 = `PROJ-${uniqueId()}`;
        const featureId = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: key1,
          featureId,
        });

        await expect(
          service.createMapping(testDir, {
            jiraIssueKey: key2,
            featureId,
          })
        ).rejects.toThrow(`Feature ${featureId} is already mapped`);
      } finally {
        await cleanupTestDir(testDir);
      }
    });
  });

  describe('updateMapping', () => {
    it('should update sync enabled flag', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;
        const featureId = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: key,
          featureId,
          syncEnabled: false,
        });

        const updated = await service.updateMapping(testDir, key, {
          syncEnabled: true,
        });

        expect(updated.syncEnabled).toBe(true);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should throw error if mapping not found', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;

        await expect(
          service.updateMapping(testDir, key, { syncEnabled: true })
        ).rejects.toThrow('No mapping found');
      } finally {
        await cleanupTestDir(testDir);
      }
    });
  });

  describe('deleteMappingByIssueKey', () => {
    it('should delete existing mapping', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;
        const featureId = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: key,
          featureId,
        });

        const deleted = await service.deleteMappingByIssueKey(testDir, key);
        expect(deleted).toBe(true);

        const mapping = await service.getMappingByIssueKey(testDir, key);
        expect(mapping).toBeNull();
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should return false if mapping does not exist', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const deleted = await service.deleteMappingByIssueKey(testDir, `PROJ-${uniqueId()}`);
        expect(deleted).toBe(false);
      } finally {
        await cleanupTestDir(testDir);
      }
    });
  });

  describe('hasMapping', () => {
    it('should return true if mapping exists', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const key = `PROJ-${uniqueId()}`;
        const featureId = `feature-${uniqueId()}`;

        await service.createMapping(testDir, {
          jiraIssueKey: key,
          featureId,
        });

        const has = await service.hasMapping(testDir, key);
        expect(has).toBe(true);
      } finally {
        await cleanupTestDir(testDir);
      }
    });

    it('should return false if mapping does not exist', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const has = await service.hasMapping(testDir, `PROJ-${uniqueId()}`);
        expect(has).toBe(false);
      } finally {
        await cleanupTestDir(testDir);
      }
    });
  });

  describe('createMappingFromIssueAndFeature', () => {
    it('should create mapping from issue and feature objects', async () => {
      const testDir = await createUniqueTestDir();
      try {
        const service = new JiraFeatureMappingService();
        const issue = createMockIssue('PROJ');
        const feature = createMockFeature('feature');

        const mapping = await service.createMappingFromIssueAndFeature(
          testDir,
          issue,
          feature
        );

        expect(mapping.jiraIssueKey).toBe(issue.key);
        expect(mapping.featureId).toBe(feature.id);
      } finally {
        await cleanupTestDir(testDir);
      }
    });
  });
});
