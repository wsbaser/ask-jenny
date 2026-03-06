import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import {
  getAskJennyDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBoardDir,
  getImagesDir,
  getWorktreesDir,
  getAppSpecPath,
  getBranchTrackingPath,
  ensureAskJennyDir,
  getGlobalSettingsPath,
  getCredentialsPath,
  getProjectSettingsPath,
  ensureDataDir,
} from '@ask-jenny/platform';

describe('ask-jenny-paths.ts', () => {
  const projectPath = path.join('/test', 'project');

  describe('getAskJennyDir', () => {
    it('should return path to .ask-jenny directory', () => {
      expect(getAskJennyDir(projectPath)).toBe(path.join(projectPath, '.ask-jenny'));
    });

    it('should handle paths with trailing slashes', () => {
      const pathWithSlash = path.join('/test', 'project') + path.sep;
      expect(getAskJennyDir(pathWithSlash)).toBe(path.join(pathWithSlash, '.ask-jenny'));
    });
  });

  describe('getFeaturesDir', () => {
    it('should return path to features directory', () => {
      expect(getFeaturesDir(projectPath)).toBe(path.join(projectPath, '.ask-jenny', 'features'));
    });
  });

  describe('getFeatureDir', () => {
    it('should return path to specific feature directory', () => {
      expect(getFeatureDir(projectPath, 'feature-123')).toBe(
        path.join(projectPath, '.ask-jenny', 'features', 'feature-123')
      );
    });

    it('should handle feature IDs with special characters', () => {
      expect(getFeatureDir(projectPath, 'my-feature_v2')).toBe(
        path.join(projectPath, '.ask-jenny', 'features', 'my-feature_v2')
      );
    });
  });

  describe('getFeatureImagesDir', () => {
    it('should return path to feature images directory', () => {
      expect(getFeatureImagesDir(projectPath, 'feature-123')).toBe(
        path.join(projectPath, '.ask-jenny', 'features', 'feature-123', 'images')
      );
    });
  });

  describe('getBoardDir', () => {
    it('should return path to board directory', () => {
      expect(getBoardDir(projectPath)).toBe(path.join(projectPath, '.ask-jenny', 'board'));
    });
  });

  describe('getImagesDir', () => {
    it('should return path to images directory', () => {
      expect(getImagesDir(projectPath)).toBe(path.join(projectPath, '.ask-jenny', 'images'));
    });
  });

  describe('getWorktreesDir', () => {
    it('should return path to worktrees directory', () => {
      expect(getWorktreesDir(projectPath)).toBe(path.join(projectPath, '.ask-jenny', 'worktrees'));
    });
  });

  describe('getAppSpecPath', () => {
    it('should return path to app_spec.txt file', () => {
      expect(getAppSpecPath(projectPath)).toBe(
        path.join(projectPath, '.ask-jenny', 'app_spec.txt')
      );
    });
  });

  describe('getBranchTrackingPath', () => {
    it('should return path to active-branches.json file', () => {
      expect(getBranchTrackingPath(projectPath)).toBe(
        path.join(projectPath, '.ask-jenny', 'active-branches.json')
      );
    });
  });

  describe('ensureAskJennyDir', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `ask-jenny-paths-test-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create ask-jenny directory and return path', async () => {
      const result = await ensureAskJennyDir(testDir);

      expect(result).toBe(path.join(testDir, '.ask-jenny'));
      const stats = await fs.stat(result);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists', async () => {
      const askJennyDir = path.join(testDir, '.ask-jenny');
      await fs.mkdir(askJennyDir, { recursive: true });

      const result = await ensureAskJennyDir(testDir);

      expect(result).toBe(askJennyDir);
    });
  });

  describe('getGlobalSettingsPath', () => {
    it('should return path to settings.json in data directory', () => {
      const dataDir = '/test/data';
      const result = getGlobalSettingsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'settings.json'));
    });

    it('should handle paths with trailing slashes', () => {
      const dataDir = '/test/data' + path.sep;
      const result = getGlobalSettingsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'settings.json'));
    });
  });

  describe('getCredentialsPath', () => {
    it('should return path to credentials.json in data directory', () => {
      const dataDir = '/test/data';
      const result = getCredentialsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'credentials.json'));
    });

    it('should handle paths with trailing slashes', () => {
      const dataDir = '/test/data' + path.sep;
      const result = getCredentialsPath(dataDir);
      expect(result).toBe(path.join(dataDir, 'credentials.json'));
    });
  });

  describe('getProjectSettingsPath', () => {
    it('should return path to settings.json in project .ask-jenny directory', () => {
      const projectPath = '/test/project';
      const result = getProjectSettingsPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'settings.json'));
    });

    it('should handle paths with trailing slashes', () => {
      const projectPath = '/test/project' + path.sep;
      const result = getProjectSettingsPath(projectPath);
      expect(result).toBe(path.join(projectPath, '.ask-jenny', 'settings.json'));
    });
  });

  describe('ensureDataDir', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `data-dir-test-${Date.now()}`);
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create data directory and return path', async () => {
      const result = await ensureDataDir(testDir);

      expect(result).toBe(testDir);
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const result = await ensureDataDir(testDir);

      expect(result).toBe(testDir);
    });

    it('should create nested directories', async () => {
      const nestedDir = path.join(testDir, 'nested', 'deep');
      const result = await ensureDataDir(nestedDir);

      expect(result).toBe(nestedDir);
      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });
});
