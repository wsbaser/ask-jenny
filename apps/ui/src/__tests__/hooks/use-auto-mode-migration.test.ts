/**
 * Unit tests for auto-mode session key handling in use-auto-mode.ts
 *
 * Tests the session storage read/write behavior using ask-jenny: prefixed keys.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Constants matching the source file
const AUTO_MODE_SESSION_KEY = 'ask-jenny:autoModeRunningByWorktreeKey';

// Helper functions to test in isolation (mirroring the source implementation)
function getWorktreeSessionKey(projectPath: string, branchName: string | null): string {
  return `${projectPath}::${branchName ?? '__main__'}`;
}

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

// Replace global sessionStorage
Object.defineProperty(global, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

// Mock window object
Object.defineProperty(global, 'window', {
  value: {
    sessionStorage: sessionStorageMock,
  },
  writable: true,
});

// Reimplement the functions to test (since they're not exported from the hook)
function readAutoModeSession(): Record<string, boolean> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.sessionStorage?.getItem(AUTO_MODE_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeAutoModeSession(next: Record<string, boolean>): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage?.setItem(AUTO_MODE_SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

describe('use-auto-mode session key storage', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('Session key constants', () => {
    it('should use ask-jenny prefix for new key', () => {
      expect(AUTO_MODE_SESSION_KEY).toBe('ask-jenny:autoModeRunningByWorktreeKey');
    });
  });

  describe('getWorktreeSessionKey', () => {
    it('should create key with project path and branch name', () => {
      const result = getWorktreeSessionKey('/projects/my-app', 'feature/auth');
      expect(result).toBe('/projects/my-app::feature/auth');
    });

    it('should use __main__ for null branch name (main worktree)', () => {
      const result = getWorktreeSessionKey('/projects/my-app', null);
      expect(result).toBe('/projects/my-app::__main__');
    });

    it('should handle Windows-style paths', () => {
      const result = getWorktreeSessionKey('C:\\Users\\dev\\project', 'main');
      expect(result).toBe('C:\\Users\\dev\\project::main');
    });

    it('should handle paths with spaces', () => {
      const result = getWorktreeSessionKey('/projects/my app', 'feature');
      expect(result).toBe('/projects/my app::feature');
    });
  });

  describe('readAutoModeSession', () => {
    it('should return empty object when no data stored', () => {
      const result = readAutoModeSession();
      expect(result).toEqual({});
    });

    it('should read from new ask-jenny key', () => {
      const data = { '/project::main': true };
      sessionStorageMock.setItem(AUTO_MODE_SESSION_KEY, JSON.stringify(data));

      const result = readAutoModeSession();
      expect(result).toEqual(data);
    });

    it('should return empty object for invalid JSON', () => {
      sessionStorageMock.setItem(AUTO_MODE_SESSION_KEY, 'not-valid-json');

      const result = readAutoModeSession();
      expect(result).toEqual({});
    });

    it('should return empty object for non-object JSON', () => {
      sessionStorageMock.setItem(AUTO_MODE_SESSION_KEY, '"string value"');

      const result = readAutoModeSession();
      expect(result).toEqual({});
    });

    it('should return empty object for null JSON', () => {
      sessionStorageMock.setItem(AUTO_MODE_SESSION_KEY, 'null');

      const result = readAutoModeSession();
      expect(result).toEqual({});
    });

    it('should handle complex worktree state', () => {
      const data = {
        '/project1::main': true,
        '/project1::feature/auth': false,
        '/project2::__main__': true,
        'C:\\Users\\dev\\project::develop': true,
      };
      sessionStorageMock.setItem(AUTO_MODE_SESSION_KEY, JSON.stringify(data));

      const result = readAutoModeSession();
      expect(result).toEqual(data);
    });
  });

  describe('writeAutoModeSession', () => {
    it('should write to new ask-jenny key', () => {
      const data = { '/project::main': true };

      writeAutoModeSession(data);

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        AUTO_MODE_SESSION_KEY,
        JSON.stringify(data)
      );
    });

    it('should not write to legacy key', () => {
      const data = { '/project::main': true };

      writeAutoModeSession(data);

      // Should only write to new key
      expect(sessionStorageMock.setItem).toHaveBeenCalledTimes(1);
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        AUTO_MODE_SESSION_KEY,
        expect.any(String)
      );
    });

    it('should handle empty object', () => {
      writeAutoModeSession({});

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(AUTO_MODE_SESSION_KEY, '{}');
    });

    it('should overwrite existing data', () => {
      sessionStorageMock.setItem(AUTO_MODE_SESSION_KEY, JSON.stringify({ old: true }));

      const newData = { '/new::key': false };
      writeAutoModeSession(newData);

      expect(sessionStorageMock.setItem).toHaveBeenLastCalledWith(
        AUTO_MODE_SESSION_KEY,
        JSON.stringify(newData)
      );
    });
  });
});
