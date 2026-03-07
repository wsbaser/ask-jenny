import { describe, it, expect } from 'vitest';
import {
  sanitizeBranchName,
  normalizePrefix,
  isValidBranchName,
  generateBranchNameFromTitle,
  MAX_BRANCH_NAME_LENGTH,
  MAX_AI_BRANCH_NAME_LENGTH,
} from '../src/branch-utils';

describe('branch-utils.ts', () => {
  describe('sanitizeBranchName', () => {
    describe('basic sanitization', () => {
      it('should trim whitespace from input', () => {
        expect(sanitizeBranchName('  add-feature  ')).toBe('add-feature');
      });

      it('should convert to lowercase', () => {
        expect(sanitizeBranchName('Add-User-Authentication')).toBe('add-user-authentication');
        expect(sanitizeBranchName('ADD-AUTH')).toBe('add-auth');
      });

      it('should replace spaces with hyphens', () => {
        expect(sanitizeBranchName('add user authentication')).toBe('add-user-authentication');
        expect(sanitizeBranchName('fix   login   bug')).toBe('fix-login-bug');
      });

      it('should replace underscores with hyphens', () => {
        expect(sanitizeBranchName('add_user_auth')).toBe('add-user-auth');
        expect(sanitizeBranchName('fix___bug')).toBe('fix-bug');
      });

      it('should remove invalid characters', () => {
        expect(sanitizeBranchName('fix@#$%special-chars!!')).toBe('fixspecial-chars');
        expect(sanitizeBranchName('add*feature?test')).toBe('addfeaturetest');
      });

      it('should collapse multiple consecutive hyphens', () => {
        expect(sanitizeBranchName('fix---bug')).toBe('fix-bug');
        expect(sanitizeBranchName('a--b---c----d')).toBe('a-b-c-d');
      });

      it('should remove leading and trailing hyphens', () => {
        expect(sanitizeBranchName('-fix-bug-')).toBe('fix-bug');
        expect(sanitizeBranchName('---leading')).toBe('leading');
        expect(sanitizeBranchName('trailing---')).toBe('trailing');
      });
    });

    describe('slash handling', () => {
      it('should allow forward slashes by default', () => {
        expect(sanitizeBranchName('feature/add-auth')).toBe('feature/add-auth');
      });

      it('should collapse multiple consecutive slashes', () => {
        expect(sanitizeBranchName('feature//add///auth')).toBe('feature/add/auth');
      });

      it('should remove leading and trailing slashes', () => {
        expect(sanitizeBranchName('/feature/add-auth/')).toBe('feature/add-auth');
      });

      it('should remove slashes when allowSlashes is false', () => {
        expect(sanitizeBranchName('feature/add-auth', { allowSlashes: false })).toBe(
          'featureadd-auth'
        );
      });
    });

    describe('prefix handling', () => {
      it('should add prefix when not present', () => {
        expect(sanitizeBranchName('add-auth', { prefix: 'feature/' })).toBe('feature/add-auth');
      });

      it('should not duplicate prefix if already present', () => {
        expect(sanitizeBranchName('feature/add-auth', { prefix: 'feature/' })).toBe(
          'feature/add-auth'
        );
      });

      it('should normalize prefix to lowercase', () => {
        expect(sanitizeBranchName('add-auth', { prefix: 'FEATURE/' })).toBe('feature/add-auth');
      });

      it('should add trailing slash to prefix if missing', () => {
        expect(sanitizeBranchName('add-auth', { prefix: 'feature' })).toBe('feature/add-auth');
      });

      it('should work with bugfix prefix', () => {
        expect(sanitizeBranchName('fix-login', { prefix: 'bugfix/' })).toBe('bugfix/fix-login');
      });

      it('should handle prefix with allowSlashes false', () => {
        expect(sanitizeBranchName('add-auth', { prefix: 'feature', allowSlashes: false })).toBe(
          'feature-add-auth'
        );
      });
    });

    describe('length truncation', () => {
      it('should truncate to maxLength', () => {
        const longName = 'this-is-a-very-long-branch-name-that-exceeds-the-limit';
        const result = sanitizeBranchName(longName, { maxLength: 30 });
        expect(result.length).toBeLessThanOrEqual(30);
      });

      it('should truncate at word boundaries when possible', () => {
        const result = sanitizeBranchName('add-user-authentication-feature', { maxLength: 25 });
        // Should truncate at a hyphen if within 30% of end
        expect(result).not.toMatch(/-$/);
      });

      it('should use default maxLength of 100', () => {
        const veryLongName = 'a'.repeat(150);
        const result = sanitizeBranchName(veryLongName);
        expect(result.length).toBeLessThanOrEqual(100);
      });

      it('should not truncate if under maxLength', () => {
        const shortName = 'short-branch';
        expect(sanitizeBranchName(shortName, { maxLength: 100 })).toBe('short-branch');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(sanitizeBranchName('')).toBe('');
      });

      it('should handle string with only invalid characters', () => {
        expect(sanitizeBranchName('!@#$%^&*()')).toBe('');
      });

      it('should handle string with only spaces', () => {
        expect(sanitizeBranchName('   ')).toBe('');
      });

      it('should handle numeric input', () => {
        expect(sanitizeBranchName('123')).toBe('123');
      });

      it('should handle mixed case with special chars', () => {
        expect(sanitizeBranchName('Fix: Login Bug #123')).toBe('fix-login-bug-123');
      });

      it('should handle unicode characters', () => {
        expect(sanitizeBranchName('fix-bug-caf\u00e9')).toBe('fix-bug-caf');
      });
    });

    describe('AI output patterns', () => {
      it('should handle typical AI responses with backticks', () => {
        expect(sanitizeBranchName('`add-user-auth`')).toBe('add-user-auth');
      });

      it('should handle AI responses with quotes', () => {
        expect(sanitizeBranchName('"add-user-auth"')).toBe('add-user-auth');
        expect(sanitizeBranchName("'add-user-auth'")).toBe('add-user-auth');
      });

      it('should handle AI responses with extra explanation', () => {
        // AI might include explanation, take just the valid parts
        expect(sanitizeBranchName('add-user-auth (for the login feature)')).toBe(
          'add-user-auth-for-the-login-feature'
        );
      });
    });
  });

  describe('normalizePrefix', () => {
    it('should convert to lowercase', () => {
      expect(normalizePrefix('FEATURE/')).toBe('feature/');
    });

    it('should add trailing slash', () => {
      expect(normalizePrefix('feature')).toBe('feature/');
    });

    it('should not duplicate trailing slash', () => {
      expect(normalizePrefix('feature/')).toBe('feature/');
    });

    it('should remove invalid characters', () => {
      expect(normalizePrefix('feat@#ure')).toBe('feature/');
    });

    it('should collapse multiple slashes', () => {
      expect(normalizePrefix('feature//')).toBe('feature/');
    });

    it('should return hyphen suffix when slashes not allowed', () => {
      expect(normalizePrefix('feature', false)).toBe('feature-');
    });

    it('should handle empty string', () => {
      expect(normalizePrefix('')).toBe('');
    });
  });

  describe('isValidBranchName', () => {
    describe('valid branch names', () => {
      it('should accept simple lowercase names', () => {
        expect(isValidBranchName('main')).toBe(true);
        expect(isValidBranchName('develop')).toBe(true);
      });

      it('should accept names with hyphens', () => {
        expect(isValidBranchName('feature-add-auth')).toBe(true);
      });

      it('should accept names with underscores', () => {
        expect(isValidBranchName('feature_add_auth')).toBe(true);
      });

      it('should accept names with dots', () => {
        expect(isValidBranchName('release.1.0')).toBe(true);
      });

      it('should accept names with forward slashes', () => {
        expect(isValidBranchName('feature/add-auth')).toBe(true);
        expect(isValidBranchName('user/john/feature')).toBe(true);
      });

      it('should accept names with numbers', () => {
        expect(isValidBranchName('feature-123')).toBe(true);
        expect(isValidBranchName('hotfix-1.2.3')).toBe(true);
      });

      it('should accept mixed case', () => {
        expect(isValidBranchName('Feature-Add-Auth')).toBe(true);
        expect(isValidBranchName('MAIN')).toBe(true);
      });
    });

    describe('invalid branch names', () => {
      it('should reject empty string', () => {
        expect(isValidBranchName('')).toBe(false);
      });

      it('should reject names with spaces', () => {
        expect(isValidBranchName('add feature')).toBe(false);
      });

      it('should reject names with special characters', () => {
        expect(isValidBranchName('feature@test')).toBe(false);
        expect(isValidBranchName('feature#123')).toBe(false);
        expect(isValidBranchName('feature*')).toBe(false);
        expect(isValidBranchName('feature?')).toBe(false);
        expect(isValidBranchName('feature:')).toBe(false);
        expect(isValidBranchName('feature~')).toBe(false);
        expect(isValidBranchName('feature^')).toBe(false);
        expect(isValidBranchName('feature[')).toBe(false);
        expect(isValidBranchName('feature\\')).toBe(false);
      });

      it('should reject names starting with a dot', () => {
        expect(isValidBranchName('.hidden')).toBe(false);
      });

      it('should reject names ending with a dot', () => {
        expect(isValidBranchName('feature.')).toBe(false);
      });

      it('should reject names with consecutive dots', () => {
        expect(isValidBranchName('feature..branch')).toBe(false);
      });

      it('should reject names ending with .lock', () => {
        expect(isValidBranchName('branch.lock')).toBe(false);
        expect(isValidBranchName('feature.lock')).toBe(false);
      });

      it('should reject names starting with a hyphen', () => {
        expect(isValidBranchName('-feature')).toBe(false);
      });

      it('should reject names exceeding max length', () => {
        const longName = 'a'.repeat(MAX_BRANCH_NAME_LENGTH);
        expect(isValidBranchName(longName)).toBe(false);
      });
    });
  });

  describe('generateBranchNameFromTitle', () => {
    it('should generate branch name from feature title', () => {
      expect(generateBranchNameFromTitle('Add User Authentication')).toBe(
        'add-user-authentication'
      );
    });

    it('should apply prefix', () => {
      expect(generateBranchNameFromTitle('Fix login bug', { prefix: 'bugfix/' })).toBe(
        'bugfix/fix-login-bug'
      );
    });

    it('should use shorter default maxLength', () => {
      const longTitle =
        'This is a very long feature title that should be truncated to a reasonable length';
      const result = generateBranchNameFromTitle(longTitle);
      expect(result.length).toBeLessThanOrEqual(60);
    });

    it('should return fallback for empty input', () => {
      expect(generateBranchNameFromTitle('')).toBe('new-branch');
    });

    it('should return fallback with prefix for empty input', () => {
      expect(generateBranchNameFromTitle('', { prefix: 'feature/' })).toBe('feature/branch');
    });

    it('should return fallback for input with only special chars', () => {
      expect(generateBranchNameFromTitle('!@#$%')).toBe('new-branch');
    });

    it('should handle real-world feature titles', () => {
      expect(generateBranchNameFromTitle('Implement dark mode toggle')).toBe(
        'implement-dark-mode-toggle'
      );
      expect(generateBranchNameFromTitle('Fix: Login validation bug in checkout flow')).toBe(
        'fix-login-validation-bug-in-checkout-flow'
      );
      expect(generateBranchNameFromTitle('Update dashboard layout & design')).toBe(
        'update-dashboard-layout-design'
      );
    });

    it('should respect custom maxLength', () => {
      const result = generateBranchNameFromTitle('Add user authentication', { maxLength: 15 });
      expect(result.length).toBeLessThanOrEqual(15);
    });
  });

  describe('constants', () => {
    it('should export MAX_BRANCH_NAME_LENGTH as 250', () => {
      expect(MAX_BRANCH_NAME_LENGTH).toBe(250);
    });

    it('should export MAX_AI_BRANCH_NAME_LENGTH as 100', () => {
      expect(MAX_AI_BRANCH_NAME_LENGTH).toBe(100);
    });
  });
});
