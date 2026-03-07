/**
 * POST /features/generate-branch-name endpoint - Generate a git branch name from a feature title/description
 *
 * Uses the provider abstraction to generate a valid, descriptive git branch name
 * from a feature title or description. Works with any configured provider (Claude, Cursor, etc.).
 *
 * The AI automatically classifies the feature type (feature, bugfix, chore, etc.) and
 * generates an appropriate branch name with the correct prefix.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@ask-jenny/utils';
import { CLAUDE_MODEL_MAP } from '@ask-jenny/model-resolver';
import { DEFAULT_BRANCH_NAME_PROMPTS, mergeBranchNamePrompts } from '@ask-jenny/prompts';
import { simpleQuery } from '../../../providers/simple-query-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { isValidBranchName, MAX_BRANCH_NAME_LENGTH } from '../../worktree/common.js';

const logger = createLogger('GenerateBranchName');

/**
 * Valid branch type classifications
 */
export type BranchType =
  | 'feature'
  | 'bugfix'
  | 'hotfix'
  | 'refactor'
  | 'chore'
  | 'docs'
  | 'test'
  | 'style'
  | 'perf';

/**
 * AI response structure for branch name generation
 */
export interface BranchNameAIResponse {
  type: BranchType;
  branchName: string;
}

/**
 * Request body for generate-branch-name endpoint
 */
export interface GenerateBranchNameRequestBody {
  /** Feature title to generate branch name from */
  title?: string;
  /** Feature description to generate branch name from (fallback if title not provided) */
  description?: string;
  /** Optional prefix override for the branch name (e.g., "feature/", "bugfix/") - overrides AI classification */
  prefix?: string;
}

/**
 * Success response for generate-branch-name endpoint
 */
export interface GenerateBranchNameSuccessResponse {
  success: true;
  branchName: string;
  /** The classified type of the branch (feature, bugfix, etc.) */
  type: BranchType;
}

/**
 * Error response for generate-branch-name endpoint
 */
export interface GenerateBranchNameErrorResponse {
  success: false;
  error: string;
}

/**
 * Combined response type for generate-branch-name endpoint
 */
export type GenerateBranchNameResponse =
  | GenerateBranchNameSuccessResponse
  | GenerateBranchNameErrorResponse;

/**
 * Parse the AI response JSON to extract branch name and type
 */
function parseAIResponse(text: string): BranchNameAIResponse | null {
  try {
    // Try to find JSON in the response (handle potential markdown code fences)
    let jsonStr = text.trim();

    // Remove markdown code fences if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);

    // Validate the response structure
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.type === 'string' &&
      typeof parsed.branchName === 'string'
    ) {
      // Validate type is one of the allowed values
      const validTypes: BranchType[] = [
        'feature',
        'bugfix',
        'hotfix',
        'refactor',
        'chore',
        'docs',
        'test',
        'style',
        'perf',
      ];
      const type = validTypes.includes(parsed.type as BranchType)
        ? (parsed.type as BranchType)
        : 'feature';

      return {
        type,
        branchName: parsed.branchName,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sanitize a branch name to ensure it's valid for git
 * This is a fallback in case the AI generates something slightly invalid
 */
function sanitizeBranchName(name: string, prefixOverride?: string): string {
  // Remove any leading/trailing whitespace
  let sanitized = name.trim();

  // Convert to lowercase
  sanitized = sanitized.toLowerCase();

  // Replace spaces and underscores with hyphens
  sanitized = sanitized.replace(/[\s_]+/g, '-');

  // Remove any characters that aren't alphanumeric, hyphens, or forward slashes
  sanitized = sanitized.replace(/[^a-z0-9\-/]/g, '');

  // Remove multiple consecutive hyphens
  sanitized = sanitized.replace(/-+/g, '-');

  // Remove multiple consecutive forward slashes
  sanitized = sanitized.replace(/\/+/g, '/');

  // Remove leading/trailing hyphens and slashes
  sanitized = sanitized.replace(/^[-/]+|[-/]+$/g, '');

  // If a prefix override is provided, use it instead of what the AI generated
  if (prefixOverride) {
    const normalizedPrefix = prefixOverride.toLowerCase().replace(/[^a-z0-9\-/]/g, '');
    // Remove any existing type prefix from the branch name
    const typePatterns = [
      'feature/',
      'bugfix/',
      'hotfix/',
      'refactor/',
      'chore/',
      'docs/',
      'test/',
      'style/',
      'perf/',
    ];
    for (const pattern of typePatterns) {
      if (sanitized.startsWith(pattern)) {
        sanitized = sanitized.slice(pattern.length);
        break;
      }
    }
    // Remove leading hyphens that might remain
    sanitized = sanitized.replace(/^[-/]+/, '');
    // Add the override prefix
    sanitized = `${normalizedPrefix}${sanitized}`;
  }

  // Truncate to max length
  const maxLength = Math.min(100, MAX_BRANCH_NAME_LENGTH - 50);
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    // Remove trailing hyphen or slash if we cut in the middle
    sanitized = sanitized.replace(/[-/]+$/, '');
  }

  return sanitized;
}

/**
 * Extract type from a branch name that already has a type prefix
 */
function extractTypeFromBranchName(branchName: string): BranchType {
  const typePatterns: { pattern: string; type: BranchType }[] = [
    { pattern: 'feature/', type: 'feature' },
    { pattern: 'bugfix/', type: 'bugfix' },
    { pattern: 'hotfix/', type: 'hotfix' },
    { pattern: 'refactor/', type: 'refactor' },
    { pattern: 'chore/', type: 'chore' },
    { pattern: 'docs/', type: 'docs' },
    { pattern: 'test/', type: 'test' },
    { pattern: 'style/', type: 'style' },
    { pattern: 'perf/', type: 'perf' },
  ];

  for (const { pattern, type } of typePatterns) {
    if (branchName.startsWith(pattern)) {
      return type;
    }
  }

  return 'feature'; // Default to feature if no type prefix found
}

/**
 * Create the generate-branch-name request handler
 */
export function createGenerateBranchNameHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, description, prefix } = req.body as GenerateBranchNameRequestBody;

      // Validate that at least title or description is provided
      const input = title || description;
      if (!input || typeof input !== 'string') {
        const response: GenerateBranchNameErrorResponse = {
          success: false,
          error: 'title or description is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      const trimmedInput = input.trim();
      if (trimmedInput.length === 0) {
        const response: GenerateBranchNameErrorResponse = {
          success: false,
          error: 'title or description cannot be empty',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Generating branch name for: ${trimmedInput.substring(0, 50)}...`);

      // Get credentials and settings for API calls
      const credentials = await settingsService?.getCredentials();
      const globalSettings = await settingsService?.getGlobalSettings();

      // Get the system prompt (potentially customized by user)
      const branchNamePrompts = mergeBranchNamePrompts(
        globalSettings?.promptCustomization?.branchName
      );
      const systemPrompt = branchNamePrompts.systemPrompt;

      const userPrompt = `Generate a git branch name for this feature:\n\n${trimmedInput}`;

      // Use simpleQuery - provider abstraction handles all the streaming/extraction
      const result = await simpleQuery({
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        model: CLAUDE_MODEL_MAP.haiku,
        cwd: process.cwd(),
        maxTurns: 1,
        allowedTools: [],
        credentials,
      });

      const responseText = result.text?.trim();

      if (!responseText || responseText.length === 0) {
        logger.warn('Received empty response from AI');
        const response: GenerateBranchNameErrorResponse = {
          success: false,
          error: 'Failed to generate branch name - empty response',
        };
        res.status(500).json(response);
        return;
      }

      // Parse the JSON response from AI
      const aiResponse = parseAIResponse(responseText);

      let branchName: string;
      let branchType: BranchType;

      if (aiResponse) {
        // AI returned valid JSON with type classification
        branchName = sanitizeBranchName(aiResponse.branchName, prefix);
        branchType = prefix ? extractTypeFromBranchName(branchName) : aiResponse.type;
      } else {
        // Fallback: AI returned plain text (old format)
        logger.warn('AI returned non-JSON response, falling back to plain text parsing');
        branchName = sanitizeBranchName(responseText, prefix || 'feature/');
        branchType = extractTypeFromBranchName(branchName);
      }

      // Validate the final branch name
      if (!isValidBranchName(branchName)) {
        logger.warn(`Generated invalid branch name: ${branchName}`);
        const response: GenerateBranchNameErrorResponse = {
          success: false,
          error: 'Failed to generate valid branch name',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Generated branch name: ${branchName} (type: ${branchType})`);

      const response: GenerateBranchNameSuccessResponse = {
        success: true,
        branchName,
        type: branchType,
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Branch name generation failed:', errorMessage);

      const response: GenerateBranchNameErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
