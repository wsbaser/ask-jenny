/**
 * Jira Integration Types
 *
 * Types for Jira integration leveraging jira.js library types.
 * Provides AutoMaker-specific types for Jira issues, projects, and validation.
 *
 * @see https://github.com/MrRefactoring/jira.js for the underlying library
 */

import type { ModelId } from './model.js';

// ============================================================================
// Re-exports from jira.js for convenience
// These are the core types from jira.js that consumers can use directly
// ============================================================================

// Note: Consumers should import jira.js types directly when needed:
// import type { Version3 } from 'jira.js';
// The types below are AutoMaker-specific wrappers and extensions

// ============================================================================
// Jira Connection & Authentication Types
// ============================================================================

/**
 * Authentication method for Jira connection
 */
export type JiraAuthMethod = 'basic' | 'oauth2' | 'pat';

/**
 * Jira Cloud vs Server/Data Center deployment type
 */
export type JiraDeploymentType = 'cloud' | 'server' | 'datacenter';

/**
 * Configuration for connecting to a Jira instance
 */
export interface JiraConnectionConfig {
  /** Jira host URL (e.g., "https://mycompany.atlassian.net") */
  host: string;
  /** Deployment type */
  deploymentType: JiraDeploymentType;
  /** Authentication method */
  authMethod: JiraAuthMethod;
  /** Email address (for basic auth with API token) */
  email?: string;
  /** API token for basic auth (Jira Cloud) */
  apiToken?: string;
  /** Personal Access Token (PAT) for Server/Data Center */
  personalAccessToken?: string;
  /** OAuth2 client ID */
  clientId?: string;
  /** OAuth2 client secret */
  clientSecret?: string;
  /** OAuth2 access token (obtained after OAuth flow) */
  accessToken?: string;
  /** OAuth2 refresh token */
  refreshToken?: string;
  /** OAuth2 token expiry timestamp */
  tokenExpiresAt?: string;
  /** Cloud ID for Atlassian Cloud (obtained during OAuth) */
  cloudId?: string;
}

/**
 * Status of Jira connection
 */
export interface JiraConnectionStatus {
  /** Whether connection is established */
  connected: boolean;
  /** User display name if connected */
  userDisplayName?: string;
  /** User account ID if connected */
  userAccountId?: string;
  /** Error message if connection failed */
  error?: string;
  /** Timestamp of last successful connection */
  lastConnectedAt?: string;
}

// ============================================================================
// Simplified Jira Types (AutoMaker-specific)
// These wrap jira.js types with only the fields we need
// ============================================================================

/**
 * Simplified Jira user for display purposes
 */
export interface JiraUser {
  /** Atlassian account ID */
  accountId: string;
  /** Display name */
  displayName: string;
  /** Email address (may be null based on privacy settings) */
  emailAddress?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Whether the user is active */
  active: boolean;
}

/**
 * Jira issue status
 */
export interface JiraStatus {
  /** Status ID */
  id: string;
  /** Status name (e.g., "To Do", "In Progress", "Done") */
  name: string;
  /** Status category key ("new", "indeterminate", "done") */
  statusCategory: 'new' | 'indeterminate' | 'done' | string;
  /** Status category color */
  colorName?: string;
}

/**
 * Jira issue priority
 */
export interface JiraPriority {
  /** Priority ID */
  id: string;
  /** Priority name (e.g., "Highest", "High", "Medium", "Low", "Lowest") */
  name: string;
  /** Icon URL */
  iconUrl?: string;
}

/**
 * Jira issue type (Bug, Story, Task, Epic, etc.)
 */
export interface JiraIssueType {
  /** Issue type ID */
  id: string;
  /** Issue type name */
  name: string;
  /** Issue type description */
  description?: string;
  /** Icon URL */
  iconUrl?: string;
  /** Whether this is a subtask type */
  subtask: boolean;
}

/**
 * Jira project component
 */
export interface JiraComponent {
  /** Component ID */
  id: string;
  /** Component name */
  name: string;
  /** Component description */
  description?: string;
}

/**
 * Jira issue label
 */
export interface JiraLabel {
  /** Label name */
  name: string;
}

/**
 * Jira fix version / release
 */
export interface JiraVersion {
  /** Version ID */
  id: string;
  /** Version name */
  name: string;
  /** Whether version is released */
  released: boolean;
  /** Release date */
  releaseDate?: string;
  /** Whether version is archived */
  archived: boolean;
}

/**
 * Jira sprint (from Agile/Scrum boards)
 */
export interface JiraSprint {
  /** Sprint ID */
  id: number;
  /** Sprint name */
  name: string;
  /** Sprint state ("active", "closed", "future") */
  state: 'active' | 'closed' | 'future' | string;
  /** Sprint start date */
  startDate?: string;
  /** Sprint end date */
  endDate?: string;
  /** Sprint board ID */
  boardId?: number;
}

/**
 * Comment on a Jira issue
 */
export interface JiraComment {
  /** Comment ID */
  id: string;
  /** Author of the comment */
  author: JiraUser;
  /** Comment body (plain text, extracted from ADF) */
  body: string;
  /** Raw ADF body for rendering */
  bodyAdf?: unknown;
  /** ISO timestamp when comment was created */
  createdAt: string;
  /** ISO timestamp when comment was last updated */
  updatedAt?: string;
  /** Update author if different from original author */
  updateAuthor?: JiraUser;
}

/**
 * Linked issue reference
 */
export interface JiraLinkedIssue {
  /** Issue key */
  key: string;
  /** Issue summary/title */
  summary: string;
  /** Link type (e.g., "blocks", "is blocked by", "relates to") */
  linkType: string;
  /** Whether this issue is inward or outward in the link relationship */
  direction: 'inward' | 'outward';
  /** Status of the linked issue */
  status: JiraStatus;
}

/**
 * Simplified Jira issue for AutoMaker
 * Contains essential fields needed for issue validation and display
 */
export interface JiraIssue {
  /** Issue ID */
  id: string;
  /** Issue key (e.g., "PROJ-123") */
  key: string;
  /** Issue summary/title */
  summary: string;
  /** Issue description (plain text, extracted from ADF) */
  description?: string;
  /** Raw ADF description for rendering */
  descriptionAdf?: unknown;
  /** Issue type */
  issueType: JiraIssueType;
  /** Current status */
  status: JiraStatus;
  /** Priority */
  priority?: JiraPriority;
  /** Assignee */
  assignee?: JiraUser;
  /** Reporter */
  reporter: JiraUser;
  /** Creator */
  creator: JiraUser;
  /** Labels */
  labels: string[];
  /** Components */
  components: JiraComponent[];
  /** Fix versions */
  fixVersions: JiraVersion[];
  /** Affected versions */
  affectedVersions?: JiraVersion[];
  /** Sprint (if using Scrum) */
  sprint?: JiraSprint;
  /** Story points (custom field, common in Agile) */
  storyPoints?: number;
  /** Epic key (if this issue belongs to an epic) */
  epicKey?: string;
  /** Epic name (if this issue belongs to an epic) */
  epicName?: string;
  /** Parent issue key (for subtasks) */
  parentKey?: string;
  /** Subtask keys */
  subtaskKeys?: string[];
  /** Linked issues */
  linkedIssues?: JiraLinkedIssue[];
  /** Comments on the issue */
  comments?: JiraComment[];
  /** Total comment count */
  commentCount?: number;
  /** Due date */
  dueDate?: string;
  /** ISO timestamp when issue was created */
  createdAt: string;
  /** ISO timestamp when issue was last updated */
  updatedAt: string;
  /** URL to view the issue in Jira */
  webUrl: string;
}

/**
 * Simplified Jira project for AutoMaker
 */
export interface JiraProject {
  /** Project ID */
  id: string;
  /** Project key (e.g., "PROJ") */
  key: string;
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Project lead */
  lead?: JiraUser;
  /** Project category */
  category?: string;
  /** Project type (software, service_desk, business) */
  projectTypeKey?: string;
  /** Whether project is simplified (next-gen) */
  simplified?: boolean;
  /** Avatar URL */
  avatarUrl?: string;
  /** Available issue types */
  issueTypes?: JiraIssueType[];
  /** Available components */
  components?: JiraComponent[];
  /** Available versions */
  versions?: JiraVersion[];
  /** URL to view the project in Jira */
  webUrl: string;
}

// ============================================================================
// Jira Issue Validation Types
// Similar to GitHub issue validation but for Jira
// ============================================================================

/**
 * Verdict from Jira issue validation
 */
export type JiraIssueValidationVerdict = 'valid' | 'invalid' | 'needs_clarification';

/**
 * Confidence level of the Jira validation
 */
export type JiraIssueValidationConfidence = 'high' | 'medium' | 'low';

/**
 * Complexity estimation for valid Jira issues
 */
export type JiraIssueComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';

/**
 * Input data for Jira issue validation (without projectPath)
 * Used by UI when calling the validation API
 */
export interface JiraIssueValidationInput {
  /** Jira issue key (e.g., "PROJ-123") */
  issueKey: string;
  /** Issue summary/title */
  issueTitle: string;
  /** Issue description */
  issueBody: string;
  /** Issue type name */
  issueType?: string;
  /** Issue labels */
  issueLabels?: string[];
  /** Comments to include in validation analysis */
  comments?: JiraComment[];
  /** Linked issues for context */
  linkedIssues?: JiraLinkedIssue[];
}

/**
 * Full request payload for Jira issue validation endpoint
 * Includes projectPath for server-side handling
 */
export interface JiraIssueValidationRequest extends JiraIssueValidationInput {
  /** Path to the project being validated against */
  projectPath: string;
  /** Jira project key */
  jiraProjectKey: string;
}

/**
 * Result from Claude's Jira issue validation analysis
 */
export interface JiraIssueValidationResult {
  /** Whether the issue is valid, invalid, or needs clarification */
  verdict: JiraIssueValidationVerdict;
  /** How confident the AI is in its assessment */
  confidence: JiraIssueValidationConfidence;
  /** Detailed explanation of the verdict */
  reasoning: string;
  /** For bug reports: whether the bug was confirmed in the codebase */
  bugConfirmed?: boolean;
  /** Files related to the issue found during analysis */
  relatedFiles?: string[];
  /** Suggested approach to fix or implement */
  suggestedFix?: string;
  /** Information that's missing and needed for validation (when verdict = needs_clarification) */
  missingInfo?: string[];
  /** Estimated effort to address the issue */
  estimatedComplexity?: JiraIssueComplexity;
  /** Suggested story points based on complexity (if using Agile) */
  suggestedStoryPoints?: number;
  /** Acceptance criteria suggestions */
  suggestedAcceptanceCriteria?: string[];
}

/**
 * Successful response from Jira validate-issue endpoint
 */
export interface JiraIssueValidationResponse {
  success: true;
  issueKey: string;
  validation: JiraIssueValidationResult;
}

/**
 * Error response from Jira validate-issue endpoint
 */
export interface JiraIssueValidationErrorResponse {
  success: false;
  error: string;
}

/**
 * Events emitted during async Jira issue validation
 */
export type JiraIssueValidationEvent =
  | {
      type: 'jira_issue_validation_start';
      issueKey: string;
      issueTitle: string;
      projectPath: string;
    }
  | {
      type: 'jira_issue_validation_progress';
      issueKey: string;
      content: string;
      projectPath: string;
    }
  | {
      type: 'jira_issue_validation_complete';
      issueKey: string;
      issueTitle: string;
      result: JiraIssueValidationResult;
      projectPath: string;
      /** Model used for validation */
      model: ModelId;
    }
  | {
      type: 'jira_issue_validation_error';
      issueKey: string;
      error: string;
      projectPath: string;
    }
  | {
      type: 'jira_issue_validation_viewed';
      issueKey: string;
      projectPath: string;
    };

/**
 * Stored Jira validation data with metadata for cache
 */
export interface StoredJiraValidation {
  /** Jira issue key */
  issueKey: string;
  /** Issue title at time of validation */
  issueTitle: string;
  /** ISO timestamp when validation was performed */
  validatedAt: string;
  /** Model used for validation */
  model: ModelId;
  /** The validation result */
  result: JiraIssueValidationResult;
  /** ISO timestamp when user viewed this validation (undefined = not yet viewed) */
  viewedAt?: string;
}

// ============================================================================
// Jira Search & Query Types
// ============================================================================

/**
 * JQL search request
 */
export interface JiraSearchRequest {
  /** JQL query string */
  jql: string;
  /** Starting index for pagination */
  startAt?: number;
  /** Maximum results to return */
  maxResults?: number;
  /** Fields to include in response */
  fields?: string[];
  /** Expand options */
  expand?: string[];
}

/**
 * Result from a Jira JQL search
 */
export interface JiraSearchResult {
  /** Issues matching the query */
  issues: JiraIssue[];
  /** Starting index */
  startAt: number;
  /** Maximum results requested */
  maxResults: number;
  /** Total matching issues */
  total: number;
  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Result from fetching Jira issue comments
 */
export interface JiraCommentsResult {
  /** List of comments */
  comments: JiraComment[];
  /** Total number of comments on the issue */
  totalCount: number;
  /** Starting index */
  startAt: number;
  /** Maximum results returned */
  maxResults: number;
  /** Whether there are more comments to fetch */
  hasMore: boolean;
}

// ============================================================================
// Jira Board & Sprint Types (Agile)
// ============================================================================

/**
 * Jira Agile board
 */
export interface JiraBoard {
  /** Board ID */
  id: number;
  /** Board name */
  name: string;
  /** Board type (scrum, kanban) */
  type: 'scrum' | 'kanban' | string;
  /** Associated project key */
  projectKey?: string;
}

/**
 * Jira backlog item (for sprint planning)
 */
export interface JiraBacklogItem {
  /** Issue reference */
  issue: JiraIssue;
  /** Current sprint (if any) */
  sprint?: JiraSprint;
  /** Rank/position in backlog */
  rank?: string;
}

// ============================================================================
// Jira Webhook & Event Types
// ============================================================================

/**
 * Jira webhook event types we handle
 */
export type JiraWebhookEventType =
  | 'jira:issue_created'
  | 'jira:issue_updated'
  | 'jira:issue_deleted'
  | 'comment_created'
  | 'comment_updated'
  | 'comment_deleted'
  | 'sprint_created'
  | 'sprint_updated'
  | 'sprint_started'
  | 'sprint_closed';

/**
 * Jira webhook payload (simplified)
 */
export interface JiraWebhookPayload {
  /** Event type */
  webhookEvent: JiraWebhookEventType;
  /** Timestamp */
  timestamp: number;
  /** Issue data (for issue events) */
  issue?: JiraIssue;
  /** Comment data (for comment events) */
  comment?: JiraComment;
  /** Sprint data (for sprint events) */
  sprint?: JiraSprint;
  /** Changelog entries (for update events) */
  changelog?: {
    items: Array<{
      field: string;
      fieldtype: string;
      from: string | null;
      fromString: string | null;
      to: string | null;
      toString: string | null;
    }>;
  };
}

// ============================================================================
// Jira to Feature Mapping Types
// ============================================================================

/**
 * Mapping between a Jira issue and an AutoMaker feature
 */
export interface JiraFeatureMapping {
  /** Jira issue key */
  jiraIssueKey: string;
  /** AutoMaker feature ID */
  featureId: string;
  /** Timestamp when mapping was created */
  createdAt: string;
  /** Whether sync is enabled for this mapping */
  syncEnabled: boolean;
  /** Last sync timestamp */
  lastSyncedAt?: string;
  /** Sync direction */
  syncDirection: 'jira_to_feature' | 'feature_to_jira' | 'bidirectional';
}

/**
 * Options for creating a feature from a Jira issue
 */
export interface CreateFeatureFromJiraOptions {
  /** Jira issue to convert */
  issue: JiraIssue;
  /** Target project path */
  projectPath: string;
  /** Whether to include comments in feature description */
  includeComments?: boolean;
  /** Whether to include linked issues as dependencies */
  includeDependencies?: boolean;
  /** Whether to enable bidirectional sync */
  enableSync?: boolean;
}
