/**
 * Jira Integration Types
 *
 * Types for Jira OAuth integration and sprint task import functionality.
 */

/**
 * Jira OAuth credentials stored securely in credentials.json
 */
export interface JiraCredentials {
  /** Jira Cloud ID for the connected site */
  cloudId: string;
  /** OAuth 2.0 access token */
  accessToken: string;
  /** OAuth 2.0 refresh token */
  refreshToken: string;
  /** Token expiration timestamp (ISO string) */
  expiresAt: string;
  /** Connected Jira site URL (e.g., https://yoursite.atlassian.net) */
  siteUrl: string;
  /** Connected Jira site name */
  siteName: string;
}

/**
 * Jira connection status returned to the frontend
 */
export interface JiraConnectionStatus {
  /** Whether Jira is connected */
  connected: boolean;
  /** Connected site URL (if connected) */
  siteUrl?: string;
  /** Connected site name (if connected) */
  siteName?: string;
  /** Error message if connection check failed */
  error?: string;
}

/**
 * Jira project information
 */
export interface JiraProject {
  /** Jira project ID */
  id: string;
  /** Project key (e.g., PROJ) */
  key: string;
  /** Project name */
  name: string;
  /** Project avatar URL */
  avatarUrl?: string;
}

/**
 * Jira sprint information
 */
export interface JiraSprint {
  /** Sprint ID */
  id: number;
  /** Sprint name */
  name: string;
  /** Sprint state: future, active, closed */
  state: 'future' | 'active' | 'closed';
  /** Sprint start date (ISO string) */
  startDate?: string;
  /** Sprint end date (ISO string) */
  endDate?: string;
  /** Board ID this sprint belongs to */
  boardId: number;
}

/**
 * Jira issue/task status
 */
export interface JiraStatus {
  /** Status ID */
  id: string;
  /** Status name (e.g., To Do, In Progress, Done) */
  name: string;
  /** Status category key: todo, indeterminate, done */
  statusCategory: 'todo' | 'indeterminate' | 'done';
}

/**
 * Jira issue priority
 */
export interface JiraPriority {
  /** Priority ID */
  id: string;
  /** Priority name */
  name: string;
  /** Priority icon URL */
  iconUrl?: string;
}

/**
 * Jira user/assignee information
 */
export interface JiraUser {
  /** User account ID */
  accountId: string;
  /** Display name */
  displayName: string;
  /** Email address (if available) */
  emailAddress?: string;
  /** Avatar URL */
  avatarUrl?: string;
}

/**
 * Jira issue type
 */
export interface JiraIssueType {
  /** Issue type ID */
  id: string;
  /** Issue type name (e.g., Story, Bug, Task) */
  name: string;
  /** Issue type icon URL */
  iconUrl?: string;
  /** Whether this is a subtask type */
  subtask: boolean;
}

/**
 * Jira issue/task returned from API
 */
export interface JiraIssue {
  /** Issue ID */
  id: string;
  /** Issue key (e.g., PROJ-123) */
  key: string;
  /** Issue summary/title */
  summary: string;
  /** Issue description (may contain Jira markup) */
  description?: string;
  /** Issue status */
  status: JiraStatus;
  /** Issue priority */
  priority?: JiraPriority;
  /** Issue type */
  issueType: JiraIssueType;
  /** Assignee */
  assignee?: JiraUser;
  /** Reporter */
  reporter?: JiraUser;
  /** Story points (if configured) */
  storyPoints?: number;
  /** Issue labels */
  labels: string[];
  /** Created timestamp (ISO string) */
  created: string;
  /** Updated timestamp (ISO string) */
  updated: string;
  /** Direct URL to issue in Jira */
  url: string;
  /** Sprint info if issue is in a sprint */
  sprint?: {
    id: number;
    name: string;
    state: string;
  };
}

/**
 * Request to import Jira issues as features
 */
export interface JiraImportRequest {
  /** Project path for the feature board */
  projectPath: string;
  /** Array of Jira issue IDs to import */
  issueIds: string[];
  /** Default category for imported features */
  defaultCategory?: string;
  /** Whether to include Jira issue key in feature title */
  includeIssueKey?: boolean;
  /** Whether to include issue URL in description */
  includeUrl?: boolean;
}

/**
 * Result of importing a single Jira issue
 */
export interface JiraImportResult {
  /** Jira issue key that was imported */
  issueKey: string;
  /** Whether import was successful */
  success: boolean;
  /** Feature ID if created */
  featureId?: string;
  /** Error message if failed */
  error?: string;
  /** Whether this was a duplicate (already imported) */
  duplicate?: boolean;
}

/**
 * Response from import operation
 */
export interface JiraImportResponse {
  /** Total issues attempted */
  total: number;
  /** Successfully imported count */
  successful: number;
  /** Failed import count */
  failed: number;
  /** Duplicate (already imported) count */
  duplicates: number;
  /** Results for each issue */
  results: JiraImportResult[];
}

/**
 * OAuth state stored during authorization flow
 */
export interface JiraOAuthState {
  /** Random state string for CSRF protection */
  state: string;
  /** Timestamp when state was created */
  createdAt: string;
  /** Return URL after OAuth completes */
  returnUrl?: string;
}

/**
 * Board information from Jira Agile API
 */
export interface JiraBoard {
  /** Board ID */
  id: number;
  /** Board name */
  name: string;
  /** Board type: scrum, kanban, simple */
  type: 'scrum' | 'kanban' | 'simple';
  /** Associated project */
  project?: JiraProject;
}

/**
 * Request to fetch sprint issues
 */
export interface JiraSprintIssuesRequest {
  /** Project path for context */
  projectPath: string;
  /** Optional board ID (will use first board if not specified) */
  boardId?: number;
  /** Optional sprint ID (will use active sprint if not specified) */
  sprintId?: number;
  /** Filter by status category */
  statusFilter?: 'todo' | 'indeterminate' | 'all';
  /** Maximum issues to return */
  maxResults?: number;
}

/**
 * Response from sprint issues request
 */
export interface JiraSprintIssuesResponse {
  /** The sprint info (undefined if no active sprint found) */
  sprint?: JiraSprint;
  /** Issues in the sprint */
  issues: JiraIssue[];
  /** Total issue count (may be more than returned) */
  total: number;
  /** Whether there are more issues */
  hasMore?: boolean;
}

/**
 * Jira configuration stored per-project
 */
export interface JiraProjectConfig {
  /** Default board ID for this project */
  defaultBoardId?: number;
  /** Default category for imported features */
  defaultCategory?: string;
  /** Whether to auto-include issue key in title */
  includeIssueKey?: boolean;
  /** Jira issue keys that have been imported */
  importedIssueKeys?: string[];
}
