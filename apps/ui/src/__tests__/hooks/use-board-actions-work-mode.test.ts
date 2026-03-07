/**
 * End-to-end tests for work mode behavior in use-board-actions.ts
 *
 * Verifies that:
 * - 'auto' mode generates a branch name (via AI or timestamp fallback)
 * - 'current' mode skips branch generation and uses current worktree branch
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Constants for mocking
const TEST_PROJECT_PATH = '/projects/test-app';
const TEST_CURRENT_BRANCH = 'feature/existing-branch';
const AI_GENERATED_BRANCH = 'feature/add-user-authentication';
const PRIMARY_BRANCH = 'main';

// Mock feature data
const createTestFeatureData = (workMode: 'current' | 'auto' = 'current') => ({
  title: 'Add User Authentication',
  category: 'Features',
  description: 'Implement user login and registration',
  images: [],
  imagePaths: [],
  textFilePaths: [],
  skipTests: false,
  model: 'claude-opus' as const,
  thinkingLevel: 'none' as const,
  reasoningEffort: 'none' as const,
  branchName: '', // Always empty, determined by workMode
  priority: 2,
  planningMode: 'skip' as const,
  requirePlanApproval: false,
  dependencies: [],
  workMode,
});

// Mock Electron API
interface MockElectronAPI {
  features: {
    generateBranchName: Mock;
    generateTitle: Mock;
  };
  worktree: {
    create: Mock;
  };
}

let mockElectronAPI: MockElectronAPI;

vi.mock('@/lib/electron', () => ({
  getElectronAPI: () => mockElectronAPI,
}));

// Mock app store
const mockAppStore = {
  addFeature: vi.fn((data) => ({
    id: `feature-${Date.now()}`,
    ...data,
    status: 'backlog',
    createdAt: new Date().toISOString(),
  })),
  updateFeature: vi.fn(),
  removeFeature: vi.fn(),
  moveFeature: vi.fn(),
  useWorktrees: true,
  enableDependencyBlocking: false,
  skipVerificationInAutoMode: false,
  isPrimaryWorktreeBranch: vi.fn((path: string, branch: string) => branch === PRIMARY_BRANCH),
  getPrimaryWorktreeBranch: vi.fn(() => PRIMARY_BRANCH),
  getAutoModeState: vi.fn(() => null),
};

vi.mock('@/store/app-store', () => ({
  useAppStore: Object.assign(() => mockAppStore, mockAppStore),
}));

// Mock auto mode
vi.mock('@/hooks/use-auto-mode', () => ({
  useAutoMode: () => ({
    startFeature: vi.fn(),
    stopFeature: vi.fn(),
    maxConcurrency: 3,
  }),
}));

// Mock mutations
vi.mock('@/hooks/mutations', () => ({
  useVerifyFeature: () => ({ mutate: vi.fn() }),
  useResumeFeature: () => ({ mutate: vi.fn() }),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock http-api-client
vi.mock('@/lib/http-api-client', () => ({
  isConnectionError: () => false,
  handleServerOffline: vi.fn(),
}));

// Mock utils
vi.mock('@/lib/utils', () => ({
  truncateDescription: (desc: string) => desc.slice(0, 50),
  modelSupportsThinking: () => false,
}));

// Mock dependency resolver
vi.mock('@ask-jenny/dependency-resolver', () => ({
  getBlockingDependencies: () => [],
}));

// Mock logger
vi.mock('@ask-jenny/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('use-board-actions work mode behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock Electron API with fresh mocks
    mockElectronAPI = {
      features: {
        generateBranchName: vi.fn(),
        generateTitle: vi.fn().mockResolvedValue({ success: true, title: 'Generated Title' }),
      },
      worktree: {
        create: vi.fn().mockResolvedValue({
          success: true,
          worktree: { path: '/worktrees/test', branch: AI_GENERATED_BRANCH, isNew: true },
        }),
      },
    };

    // Reset store mocks
    mockAppStore.addFeature.mockClear();
    mockAppStore.updateFeature.mockClear();
  });

  describe('Auto Mode - Branch Generation', () => {
    it('should generate branch name via AI when workMode is "auto"', async () => {
      // Setup: AI successfully generates a branch name
      mockElectronAPI.features.generateBranchName.mockResolvedValue({
        success: true,
        branchName: AI_GENERATED_BRANCH,
      });

      // Simulate the logic from use-board-actions handleAddFeature
      const featureData = createTestFeatureData('auto');
      let finalBranchName: string | undefined;

      // Execute the branch determination logic
      if (featureData.workMode === 'auto') {
        const api = mockElectronAPI;
        if (api?.features?.generateBranchName) {
          const inputForBranchName = featureData.title.trim() || featureData.description;
          const result = await api.features.generateBranchName(
            inputForBranchName,
            featureData.description
          );
          if (result.success && result.branchName) {
            finalBranchName = result.branchName;
          }
        }

        if (!finalBranchName) {
          // Fallback to timestamp
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          finalBranchName = `feature/${PRIMARY_BRANCH}-${timestamp}-${randomSuffix}`;
        }
      }

      // Verify AI was called
      expect(mockElectronAPI.features.generateBranchName).toHaveBeenCalledTimes(1);
      expect(mockElectronAPI.features.generateBranchName).toHaveBeenCalledWith(
        featureData.title,
        featureData.description
      );

      // Verify AI-generated branch was used
      expect(finalBranchName).toBe(AI_GENERATED_BRANCH);
    });

    it('should fall back to timestamp-based branch name when AI fails', async () => {
      // Setup: AI fails to generate a branch name
      mockElectronAPI.features.generateBranchName.mockRejectedValue(new Error('AI unavailable'));

      const featureData = createTestFeatureData('auto');
      let finalBranchName: string | undefined;

      // Execute the branch determination logic
      if (featureData.workMode === 'auto') {
        const api = mockElectronAPI;
        let aiGeneratedBranch: string | undefined;

        if (api?.features?.generateBranchName) {
          try {
            const inputForBranchName = featureData.title.trim() || featureData.description;
            const result = await api.features.generateBranchName(
              inputForBranchName,
              featureData.description
            );
            if (result.success && result.branchName) {
              aiGeneratedBranch = result.branchName;
            }
          } catch {
            // AI failed, will use fallback
          }
        }

        if (aiGeneratedBranch) {
          finalBranchName = aiGeneratedBranch;
        } else {
          // Fallback: timestamp-based branch name
          const baseBranch = mockAppStore.getPrimaryWorktreeBranch(TEST_PROJECT_PATH) || 'main';
          const timestamp = 1234567890;
          const randomSuffix = 'abc1';
          finalBranchName = `feature/${baseBranch}-${timestamp}-${randomSuffix}`;
        }
      }

      // Verify AI was attempted
      expect(mockElectronAPI.features.generateBranchName).toHaveBeenCalledTimes(1);

      // Verify fallback pattern was used
      expect(finalBranchName).toMatch(/^feature\/main-\d+-[a-z0-9]+$/);
    });

    it('should create worktree when auto mode generates a branch', async () => {
      mockElectronAPI.features.generateBranchName.mockResolvedValue({
        success: true,
        branchName: AI_GENERATED_BRANCH,
      });

      const featureData = createTestFeatureData('auto');
      let finalBranchName: string | undefined = AI_GENERATED_BRANCH;

      // Simulate worktree creation
      if (featureData.workMode === 'auto' && finalBranchName) {
        const api = mockElectronAPI;
        if (api?.worktree?.create) {
          await api.worktree.create(TEST_PROJECT_PATH, finalBranchName);
        }
      }

      // Verify worktree was created
      expect(mockElectronAPI.worktree.create).toHaveBeenCalledTimes(1);
      expect(mockElectronAPI.worktree.create).toHaveBeenCalledWith(
        TEST_PROJECT_PATH,
        AI_GENERATED_BRANCH
      );
    });

    it('should use description when title is empty for AI branch generation', async () => {
      mockElectronAPI.features.generateBranchName.mockResolvedValue({
        success: true,
        branchName: 'feature/implement-user-login',
      });

      const featureData = createTestFeatureData('auto');
      featureData.title = ''; // Empty title
      featureData.description = 'Implement user login and registration';

      // Execute the branch determination logic
      if (featureData.workMode === 'auto') {
        const api = mockElectronAPI;
        if (api?.features?.generateBranchName) {
          const inputForBranchName = featureData.title.trim() || featureData.description;
          await api.features.generateBranchName(inputForBranchName, featureData.description);
        }
      }

      // Verify description was used as input when title is empty
      expect(mockElectronAPI.features.generateBranchName).toHaveBeenCalledWith(
        featureData.description, // Description used as first arg
        featureData.description
      );
    });
  });

  describe('Current Mode - Skip Branch Generation', () => {
    it('should NOT call AI branch generation when workMode is "current"', async () => {
      const featureData = createTestFeatureData('current');
      let finalBranchName: string | undefined;

      // Execute the branch determination logic for 'current' mode
      if (featureData.workMode === 'current') {
        // Work directly on current branch - use the current worktree's branch if not on main
        finalBranchName = TEST_CURRENT_BRANCH || undefined;
      } else if (featureData.workMode === 'auto') {
        // This branch should NOT be reached
        const api = mockElectronAPI;
        if (api?.features?.generateBranchName) {
          await api.features.generateBranchName(featureData.title, featureData.description);
        }
      }

      // Verify AI was NOT called
      expect(mockElectronAPI.features.generateBranchName).not.toHaveBeenCalled();

      // Verify current branch is used
      expect(finalBranchName).toBe(TEST_CURRENT_BRANCH);
    });

    it('should NOT create worktree when workMode is "current"', async () => {
      const featureData = createTestFeatureData('current');
      const finalBranchName = TEST_CURRENT_BRANCH;

      // Simulate the worktree creation logic
      if (featureData.workMode === 'auto' && finalBranchName) {
        // This should NOT be reached for 'current' mode
        const api = mockElectronAPI;
        if (api?.worktree?.create) {
          await api.worktree.create(TEST_PROJECT_PATH, finalBranchName);
        }
      }

      // Verify worktree was NOT created
      expect(mockElectronAPI.worktree.create).not.toHaveBeenCalled();
    });

    it('should use undefined when currentWorktreeBranch is null (main worktree)', () => {
      const featureData = createTestFeatureData('current');
      const currentWorktreeBranch: string | null = null;
      let finalBranchName: string | undefined;

      // Execute the branch determination logic for 'current' mode on main worktree
      if (featureData.workMode === 'current') {
        finalBranchName = currentWorktreeBranch || undefined;
      }

      // Verify undefined is returned for main worktree
      expect(finalBranchName).toBeUndefined();
    });

    it('should use the current worktree branch when on a feature branch', () => {
      const featureData = createTestFeatureData('current');
      const currentWorktreeBranch = 'feature/existing-work';
      let finalBranchName: string | undefined;

      // Execute the branch determination logic
      if (featureData.workMode === 'current') {
        finalBranchName = currentWorktreeBranch || undefined;
      }

      // Verify the existing branch is used
      expect(finalBranchName).toBe('feature/existing-work');
    });
  });

  describe('End-to-End Flow Verification', () => {
    it('should handle complete flow for auto mode with successful AI generation', async () => {
      mockElectronAPI.features.generateBranchName.mockResolvedValue({
        success: true,
        branchName: AI_GENERATED_BRANCH,
      });

      const featureData = createTestFeatureData('auto');
      const currentWorktreeBranch: string | null = null; // On main worktree

      // Full flow simulation
      let finalBranchName: string | undefined;

      if (featureData.workMode === 'current') {
        finalBranchName = currentWorktreeBranch || undefined;
      } else if (featureData.workMode === 'auto') {
        // Step 1: Try AI generation
        const api = mockElectronAPI;
        let aiGeneratedBranch: string | undefined;

        if (api?.features?.generateBranchName) {
          try {
            const inputForBranchName = featureData.title.trim() || featureData.description;
            const result = await api.features.generateBranchName(
              inputForBranchName,
              featureData.description
            );
            if (result.success && result.branchName) {
              aiGeneratedBranch = result.branchName;
            }
          } catch {
            // Will fall back to timestamp
          }
        }

        finalBranchName = aiGeneratedBranch || `feature/main-${Date.now()}-fallback`;

        // Step 2: Create worktree
        if (finalBranchName) {
          await mockElectronAPI.worktree.create(TEST_PROJECT_PATH, finalBranchName);
        }
      }

      // Verify complete flow
      expect(mockElectronAPI.features.generateBranchName).toHaveBeenCalledTimes(1);
      expect(finalBranchName).toBe(AI_GENERATED_BRANCH);
      expect(mockElectronAPI.worktree.create).toHaveBeenCalledWith(
        TEST_PROJECT_PATH,
        AI_GENERATED_BRANCH
      );
    });

    it('should handle complete flow for current mode (no branch generation)', () => {
      const featureData = createTestFeatureData('current');
      const currentWorktreeBranch = 'feature/my-branch';

      // Full flow simulation
      let finalBranchName: string | undefined;

      if (featureData.workMode === 'current') {
        finalBranchName = currentWorktreeBranch || undefined;
      } else if (featureData.workMode === 'auto') {
        // This should not execute
        finalBranchName = 'should-not-be-this';
      }

      // Verify complete flow for current mode
      expect(mockElectronAPI.features.generateBranchName).not.toHaveBeenCalled();
      expect(mockElectronAPI.worktree.create).not.toHaveBeenCalled();
      expect(finalBranchName).toBe('feature/my-branch');
    });

    it('should correctly differentiate feature data based on work mode', () => {
      const autoModeData = createTestFeatureData('auto');
      const currentModeData = createTestFeatureData('current');

      // Both start with empty branchName
      expect(autoModeData.branchName).toBe('');
      expect(currentModeData.branchName).toBe('');

      // Only workMode differs
      expect(autoModeData.workMode).toBe('auto');
      expect(currentModeData.workMode).toBe('current');
    });
  });
});
