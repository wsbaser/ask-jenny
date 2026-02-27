import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  getAskJennyDir,
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBoardDir,
  getImagesDir,
  getContextDir,
  getWorktreesDir,
  getAppSpecPath,
  getBranchTrackingPath,
  ensureAskJennyDir,
  ensureAutomakerDir,
  getGlobalSettingsPath,
  getCredentialsPath,
  getProjectSettingsPath,
  ensureDataDir,
} from '../src/paths';

describe('paths.ts', () => {
  let tempDir: string;
  let projectPath: string;
  let dataDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'platform-paths-test-'));
    projectPath = path.join(tempDir, 'test-project');
    dataDir = path.join(tempDir, 'user-data');
    await fs.mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Project-level path construction (new ask-jenny naming)', () => {
    it('should return ask-jenny directory path with getAskJennyDir', () => {
      const result = getAskJennyDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny'));
    });

    it('should return ask-jenny directory path with deprecated getAutomakerDir alias', () => {
      const result = getAutomakerDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny'));
    });

    it('getAutomakerDir should be identical to getAskJennyDir (backwards compatibility)', () => {
      const askJennyResult = getAskJennyDir(projectPath);
      const automakerResult = getAutomakerDir(projectPath);
      expect(askJennyResult).toBe(automakerResult);
    });

    it('should return features directory path under .ask-jenny', () => {
      const result = getFeaturesDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'features'));
    });

    it('should return feature directory path under .ask-jenny', () => {
      const featureId = 'auth-feature';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'features', featureId));
    });

    it('should return feature images directory path under .ask-jenny', () => {
      const featureId = 'auth-feature';
      const result = getFeatureImagesDir(projectPath, featureId);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'features', featureId, 'images'));
    });

    it('should return board directory path under .ask-jenny', () => {
      const result = getBoardDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'board'));
    });

    it('should return images directory path under .ask-jenny', () => {
      const result = getImagesDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'images'));
    });

    it('should return context directory path under .ask-jenny', () => {
      const result = getContextDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'context'));
    });

    it('should return worktrees directory path under .ask-jenny', () => {
      const result = getWorktreesDir(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'worktrees'));
    });

    it('should return app spec file path under .ask-jenny', () => {
      const result = getAppSpecPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'app_spec.txt'));
    });

    it('should return branch tracking file path under .ask-jenny', () => {
      const result = getBranchTrackingPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'active-branches.json'));
    });

    it('should return project settings file path under .ask-jenny', () => {
      const result = getProjectSettingsPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'settings.json'));
    });
  });

  describe('Global settings path construction', () => {
    it('should return global settings path', () => {
      const result = getGlobalSettingsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'settings.json'));
    });

    it('should return credentials path', () => {
      const result = getCredentialsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'credentials.json'));
    });
  });

  describe('Directory creation', () => {
    it('should create ask-jenny directory with ensureAskJennyDir', async () => {
      const askJennyDir = await ensureAskJennyDir(projectPath);

      expect(askJennyDir).toBe(path.join(projectPath, '.ask-jenny'));

      const stats = await fs.stat(askJennyDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create ask-jenny directory with deprecated ensureAutomakerDir alias', async () => {
      const automakerDir = await ensureAutomakerDir(projectPath);

      expect(automakerDir).toBe(path.join(projectPath, '.ask-jenny'));

      const stats = await fs.stat(automakerDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('ensureAutomakerDir should be identical to ensureAskJennyDir (backwards compatibility)', async () => {
      const askJennyResult = await ensureAskJennyDir(projectPath);

      // Need a fresh directory for the second test
      const secondProjectPath = path.join(tempDir, 'test-project-2');
      await fs.mkdir(secondProjectPath, { recursive: true });
      const automakerResult = await ensureAutomakerDir(secondProjectPath);

      // Both should create .ask-jenny directories
      expect(askJennyResult).toBe(path.join(projectPath, '.ask-jenny'));
      expect(automakerResult).toBe(path.join(secondProjectPath, '.ask-jenny'));
    });

    it('should be idempotent when creating ask-jenny directory', async () => {
      // Create directory first time
      const firstResult = await ensureAskJennyDir(projectPath);

      // Create directory second time
      const secondResult = await ensureAskJennyDir(projectPath);

      expect(firstResult).toBe(secondResult);

      const stats = await fs.stat(firstResult);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create data directory', async () => {
      const result = await ensureDataDir(dataDir);

      expect(result).toBe(dataDir);

      const stats = await fs.stat(dataDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should be idempotent when creating data directory', async () => {
      // Create directory first time
      const firstResult = await ensureDataDir(dataDir);

      // Create directory second time
      const secondResult = await ensureDataDir(dataDir);

      expect(firstResult).toBe(secondResult);

      const stats = await fs.stat(firstResult);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories recursively', async () => {
      const deepProjectPath = path.join(tempDir, 'nested', 'deep', 'project');
      await fs.mkdir(deepProjectPath, { recursive: true });

      const askJennyDir = await ensureAskJennyDir(deepProjectPath);

      const stats = await fs.stat(askJennyDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Path handling with special characters', () => {
    it('should handle feature IDs with special characters', () => {
      const featureId = 'feature-with-dashes_and_underscores';
      const result = getFeatureDir(projectPath, featureId);
      expect(result).toContain(featureId);
    });

    it('should handle paths with spaces', () => {
      const pathWithSpaces = path.join(tempDir, 'path with spaces');
      const result = getAskJennyDir(pathWithSpaces);
      expect(result).toBe(path.join(pathWithSpaces, '.ask-jenny'));
    });
  });

  describe('Path relationships', () => {
    it('should have feature dir as child of features dir', () => {
      const featuresDir = getFeaturesDir(projectPath);
      const featureDir = getFeatureDir(projectPath, 'test-feature');

      expect(featureDir.startsWith(featuresDir)).toBe(true);
    });

    it('should have all project paths under ask-jenny dir', () => {
      const askJennyDir = getAskJennyDir(projectPath);
      const paths = [
        getFeaturesDir(projectPath),
        getBoardDir(projectPath),
        getImagesDir(projectPath),
        getContextDir(projectPath),
        getWorktreesDir(projectPath),
        getAppSpecPath(projectPath),
        getBranchTrackingPath(projectPath),
        getProjectSettingsPath(projectPath),
      ];

      paths.forEach((p) => {
        expect(p.startsWith(askJennyDir)).toBe(true);
      });
    });
  });
});
