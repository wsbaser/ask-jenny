/**
 * Branch name utilities for git branch operations
 *
 * Provides utilities for sanitizing branch names, particularly for
 * AI-generated branch names that may contain invalid characters.
 */

/** Maximum length for sanitized branch names (git default limit is 250) */
export const MAX_BRANCH_NAME_LENGTH = 250;

/** Maximum length for AI-generated branch names (shorter for readability) */
export const MAX_AI_BRANCH_NAME_LENGTH = 100;

/** Default maximum length for sanitized branch names */
const DEFAULT_MAX_LENGTH = 100;

/**
 * Options for branch name sanitization
 */
export interface SanitizeBranchNameOptions {
  /**
   * Optional prefix for the branch name (e.g., "feature/", "bugfix/")
   * Will be normalized and prepended if not already present
   */
  prefix?: string;

  /**
   * Maximum length for the branch name (default: 100)
   * Will truncate cleanly at word boundaries when possible
   */
  maxLength?: number;

  /**
   * Whether to allow forward slashes in the branch name (default: true)
   * Set to false for simpler branch names without path separators
   */
  allowSlashes?: boolean;
}

/**
 * Sanitize a branch name for git use, particularly for AI-generated output.
 *
 * Applies the following transformations:
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces spaces and underscores with hyphens
 * - Removes invalid characters (keeps only a-z, 0-9, hyphens, and optionally slashes)
 * - Collapses multiple consecutive hyphens or slashes
 * - Removes leading/trailing hyphens and slashes
 * - Applies optional prefix if not already present
 * - Truncates to maximum length, cleaning up trailing separators
 *
 * @param name - The branch name to sanitize (e.g., AI-generated output)
 * @param options - Optional configuration for sanitization
 * @returns A valid, sanitized git branch name
 *
 * @example
 * ```typescript
 * // Basic sanitization
 * sanitizeBranchName('Add User Authentication')
 * // Returns: 'add-user-authentication'
 *
 * // With prefix
 * sanitizeBranchName('fix login bug', { prefix: 'bugfix/' })
 * // Returns: 'bugfix/fix-login-bug'
 *
 * // Already has prefix
 * sanitizeBranchName('feature/add-auth', { prefix: 'feature/' })
 * // Returns: 'feature/add-auth'
 *
 * // Invalid characters removed
 * sanitizeBranchName('Fix @#$ special chars!!')
 * // Returns: 'fix-special-chars'
 *
 * // Truncation
 * sanitizeBranchName('this is a very long branch name that exceeds limits', { maxLength: 30 })
 * // Returns: 'this-is-a-very-long-branch' (truncated cleanly)
 * ```
 */
export function sanitizeBranchName(name: string, options: SanitizeBranchNameOptions = {}): string {
  const { prefix, maxLength = DEFAULT_MAX_LENGTH, allowSlashes = true } = options;

  // Remove any leading/trailing whitespace
  let sanitized = name.trim();

  // Convert to lowercase
  sanitized = sanitized.toLowerCase();

  // Replace spaces and underscores with hyphens
  sanitized = sanitized.replace(/[\s_]+/g, '-');

  // Remove any characters that aren't alphanumeric, hyphens, or forward slashes
  if (allowSlashes) {
    sanitized = sanitized.replace(/[^a-z0-9\-/]/g, '');
  } else {
    sanitized = sanitized.replace(/[^a-z0-9\-]/g, '');
  }

  // Remove multiple consecutive hyphens
  sanitized = sanitized.replace(/-+/g, '-');

  // Remove multiple consecutive forward slashes
  if (allowSlashes) {
    sanitized = sanitized.replace(/\/+/g, '/');
  }

  // Remove leading/trailing hyphens and slashes
  sanitized = sanitized.replace(/^[-/]+|[-/]+$/g, '');

  // Add prefix if provided and not already present
  if (prefix) {
    const normalizedPrefix = normalizePrefix(prefix, allowSlashes);
    if (normalizedPrefix && !sanitized.startsWith(normalizedPrefix)) {
      sanitized = `${normalizedPrefix}${sanitized}`;
    }
  }

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = truncateBranchName(sanitized, maxLength);
  }

  return sanitized;
}

/**
 * Normalize a branch name prefix for consistent use.
 *
 * @param prefix - The prefix to normalize
 * @param allowSlashes - Whether to allow slashes in the prefix
 * @returns Normalized prefix ending with a slash or hyphen
 *
 * @example
 * ```typescript
 * normalizePrefix('feature/')
 * // Returns: 'feature/'
 *
 * normalizePrefix('FEATURE')
 * // Returns: 'feature/'
 *
 * normalizePrefix('bug-fix')
 * // Returns: 'bug-fix/'
 * ```
 */
export function normalizePrefix(prefix: string, allowSlashes: boolean = true): string {
  let normalized = prefix.toLowerCase().trim();

  // Remove invalid characters
  if (allowSlashes) {
    normalized = normalized.replace(/[^a-z0-9\-/]/g, '');
  } else {
    normalized = normalized.replace(/[^a-z0-9\-]/g, '');
  }

  // Collapse multiple hyphens/slashes
  normalized = normalized.replace(/-+/g, '-').replace(/\/+/g, '/');

  // Ensure it ends with a slash (or hyphen if slashes not allowed)
  if (normalized.length > 0) {
    if (allowSlashes && !normalized.endsWith('/')) {
      normalized = `${normalized}/`;
    } else if (!allowSlashes && !normalized.endsWith('-')) {
      normalized = `${normalized}-`;
    }
  }

  return normalized;
}

/**
 * Truncate a branch name to a maximum length, attempting to break at
 * word boundaries (hyphens or slashes) for cleaner results.
 *
 * @param name - The branch name to truncate
 * @param maxLength - Maximum length
 * @returns Truncated branch name
 */
function truncateBranchName(name: string, maxLength: number): string {
  if (name.length <= maxLength) {
    return name;
  }

  let truncated = name.substring(0, maxLength);

  // Try to find a clean break point (hyphen or slash) in the last 30% of the string
  const searchStart = Math.floor(maxLength * 0.7);
  let lastBreak = -1;

  for (let i = truncated.length - 1; i >= searchStart; i--) {
    if (truncated[i] === '-' || truncated[i] === '/') {
      lastBreak = i;
      break;
    }
  }

  // If found a break point, truncate there
  if (lastBreak > searchStart) {
    truncated = truncated.substring(0, lastBreak);
  }

  // Remove any trailing hyphen or slash
  truncated = truncated.replace(/[-/]+$/, '');

  return truncated;
}

/**
 * Validate if a string is a valid git branch name.
 *
 * Git branch names:
 * - Cannot contain: space, ~, ^, :, ?, *, [, \, or control chars
 * - Cannot start or end with a dot
 * - Cannot contain consecutive dots (..)
 * - Cannot end with .lock
 *
 * This function uses a simplified validation that allows:
 * alphanumeric, dots (.), underscores (_), hyphens (-), and forward slashes (/)
 *
 * @param name - The branch name to validate
 * @returns True if the branch name is valid
 *
 * @example
 * ```typescript
 * isValidBranchName('feature/add-auth')
 * // Returns: true
 *
 * isValidBranchName('invalid branch name!')
 * // Returns: false
 *
 * isValidBranchName('')
 * // Returns: false
 * ```
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name.length === 0 || name.length >= MAX_BRANCH_NAME_LENGTH) {
    return false;
  }

  // Allow alphanumeric, dots, underscores, hyphens, and forward slashes
  if (!/^[a-zA-Z0-9._\-/]+$/.test(name)) {
    return false;
  }

  // Additional git constraints
  if (name.startsWith('.') || name.endsWith('.')) {
    return false;
  }

  if (name.includes('..')) {
    return false;
  }

  if (name.endsWith('.lock')) {
    return false;
  }

  // Cannot start with a hyphen
  if (name.startsWith('-')) {
    return false;
  }

  return true;
}

/**
 * Generate a default branch name from a feature title or description.
 *
 * This is a simpler alternative to AI-generated branch names, useful as
 * a fallback or for quick local development.
 *
 * @param input - Feature title or description
 * @param options - Optional configuration
 * @returns A sanitized branch name derived from the input
 *
 * @example
 * ```typescript
 * generateBranchNameFromTitle('Add User Authentication')
 * // Returns: 'add-user-authentication'
 *
 * generateBranchNameFromTitle('Fix login bug in checkout flow', { prefix: 'bugfix/' })
 * // Returns: 'bugfix/fix-login-bug-in-checkout-flow'
 * ```
 */
export function generateBranchNameFromTitle(
  input: string,
  options: SanitizeBranchNameOptions = {}
): string {
  // First sanitize the input using the main function (without prefix, we'll add fallback if needed)
  const sanitizedInput = sanitizeBranchName(input, {
    ...options,
    prefix: undefined, // Don't add prefix yet, we need to check the base name first
    maxLength: options.maxLength ?? 60, // Shorter default for title-based names
  });

  // If result is empty or too short, return a fallback
  if (sanitizedInput.length < 3) {
    const prefix = options.prefix
      ? normalizePrefix(options.prefix, options.allowSlashes ?? true)
      : '';
    return prefix ? prefix + 'branch' : 'new-branch';
  }

  // Now add the prefix if needed
  if (options.prefix) {
    return sanitizeBranchName(sanitizedInput, {
      prefix: options.prefix,
      maxLength: options.maxLength ?? 60,
    });
  }

  return sanitizedInput;
}
