/**
 * Jira Service - Wraps jira.js Version3Client for Jira Cloud/Server integration
 *
 * Provides a high-level interface for:
 * - Authentication and connection management
 * - Issue CRUD operations
 * - Project queries
 * - JQL search
 * - Agile/Sprint operations (via AgileClient)
 * - Comment management
 *
 * @see https://github.com/MrRefactoring/jira.js for the underlying library
 */

import { Version3Client, AgileClient, Config } from 'jira.js';
import type { Version3Models, AgileModels, Version3Parameters } from 'jira.js';

// Simple logger for this service (avoiding cross-package import issues during build)
const logger = {
  info: (...args: unknown[]) => console.log('[JiraService]', ...args),
  error: (...args: unknown[]) => console.error('[JiraService]', ...args),
  warn: (...args: unknown[]) => console.warn('[JiraService]', ...args),
  debug: (...args: unknown[]) => console.debug('[JiraService]', ...args),
};

import type {
  JiraConnectionConfig,
  JiraConnectionStatus,
  JiraIssue,
  JiraProject,
  JiraUser,
  JiraStatus,
  JiraPriority,
  JiraIssueType,
  JiraComponent,
  JiraVersion,
  JiraSprint,
  JiraComment,
  JiraLinkedIssue,
  JiraSearchRequest,
  JiraSearchResult,
  JiraCommentsResult,
  JiraBoard,
} from '@automaker/types';

/**
 * Callback function type for token refresh
 *
 * When OAuth tokens are about to expire, this callback is invoked to refresh them.
 * The callback should refresh the tokens and return the new access token.
 *
 * @returns Promise resolving to new access token, or null if refresh failed
 */
export type TokenRefreshCallback = () => Promise<string | null>;

/**
 * Extended configuration that includes token refresh support
 */
export interface JiraConnectionConfigWithRefresh extends JiraConnectionConfig {
  /** OAuth token expiry timestamp (ISO string) */
  tokenExpiresAt?: string;
  /** Callback to refresh expired tokens */
  onTokenRefresh?: TokenRefreshCallback;
}

/**
 * Error class for Jira API errors
 */
export class JiraApiError extends Error {
  public readonly statusCode?: number;
  public readonly jiraErrorMessages?: string[];

  constructor(message: string, statusCode?: number, jiraErrorMessages?: string[]) {
    super(message);
    this.name = 'JiraApiError';
    this.statusCode = statusCode;
    this.jiraErrorMessages = jiraErrorMessages;
  }
}

/**
 * Options for fetching an issue
 */
export interface GetIssueOptions {
  /** Include comments in the response */
  includeComments?: boolean;
  /** Maximum number of comments to fetch */
  maxComments?: number;
  /** Include linked issues in the response */
  includeLinks?: boolean;
  /** Additional fields to expand */
  expand?: string[];
}

/**
 * Options for creating an issue
 */
export interface CreateIssueOptions {
  projectKey: string;
  summary: string;
  description?: string;
  issueTypeName: string;
  priority?: string;
  assigneeAccountId?: string;
  labels?: string[];
  components?: string[];
  fixVersions?: string[];
}

/**
 * Options for updating an issue
 */
export interface UpdateIssueOptions {
  summary?: string;
  description?: string;
  priority?: string;
  assigneeAccountId?: string;
  labels?: string[];
  components?: string[];
  fixVersions?: string[];
}

/** Token refresh buffer - refresh 5 minutes before expiry */
const TOKEN_REFRESH_BUFFER_SECONDS = 300;

/**
 * JiraService - Manages Jira API interactions through jira.js clients
 *
 * Wraps the Version3Client for standard Jira operations and AgileClient for
 * sprint/board operations. Provides methods that return AutoMaker-specific
 * types defined in @automaker/types.
 *
 * Supports automatic token refresh for OAuth2 connections. When configured with
 * a token expiry time and refresh callback, the service will automatically
 * refresh tokens before they expire.
 */
export class JiraService {
  private client: Version3Client | null = null;
  private agileClient: AgileClient | null = null;
  private config: JiraConnectionConfigWithRefresh | null = null;
  private connectionStatus: JiraConnectionStatus = { connected: false };
  private tokenRefreshCallback: TokenRefreshCallback | null = null;
  private tokenExpiresAt: Date | null = null;
  private isRefreshingToken = false;

  /**
   * Initialize the Jira service with connection configuration
   *
   * Creates both Version3Client and AgileClient instances using the provided
   * authentication configuration. Supports basic auth (email + API token),
   * OAuth2, and Personal Access Tokens.
   *
   * For OAuth2 connections, you can provide a token expiry time and refresh
   * callback to enable automatic token refresh before expiry.
   *
   * @param config - Jira connection configuration (optionally with refresh support)
   */
  async initialize(config: JiraConnectionConfig | JiraConnectionConfigWithRefresh): Promise<void> {
    this.config = config as JiraConnectionConfigWithRefresh;

    // Set up token refresh if provided
    const extendedConfig = config as JiraConnectionConfigWithRefresh;
    if (extendedConfig.tokenExpiresAt) {
      this.tokenExpiresAt = new Date(extendedConfig.tokenExpiresAt);
      logger.debug(`Token expires at: ${this.tokenExpiresAt.toISOString()}`);
    }
    if (extendedConfig.onTokenRefresh) {
      this.tokenRefreshCallback = extendedConfig.onTokenRefresh;
      logger.info('Token refresh callback configured');
    }

    const clientConfig = this.buildClientConfig(config);

    try {
      this.client = new Version3Client(clientConfig);
      this.agileClient = new AgileClient(clientConfig);
      logger.info(`JiraService initialized for host: ${config.host}`);
    } catch (error) {
      logger.error('Failed to initialize Jira clients:', error);
      throw new JiraApiError(
        `Failed to initialize Jira client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Set or update the token refresh callback
   *
   * This can be called after initialization to add token refresh support
   * without reinitializing the entire service.
   *
   * @param callback - Callback function to refresh tokens
   * @param expiresAt - Token expiry timestamp (ISO string or Date)
   */
  setTokenRefreshCallback(callback: TokenRefreshCallback, expiresAt?: string | Date): void {
    this.tokenRefreshCallback = callback;
    if (expiresAt) {
      this.tokenExpiresAt = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    }
    logger.info('Token refresh callback updated');
  }

  /**
   * Update the token expiry time
   *
   * Called after a successful token refresh to update the expiry tracking.
   *
   * @param expiresAt - New token expiry timestamp (ISO string or Date)
   */
  updateTokenExpiry(expiresAt: string | Date): void {
    this.tokenExpiresAt = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    logger.debug(`Token expiry updated to: ${this.tokenExpiresAt.toISOString()}`);
  }

  /**
   * Check if the current token needs to be refreshed
   *
   * @returns True if token is expired or will expire within the buffer period
   */
  private shouldRefreshToken(): boolean {
    if (!this.tokenExpiresAt) {
      return false; // No expiry info - can't determine if refresh needed
    }

    const now = new Date();
    const refreshThreshold = new Date(now.getTime() + TOKEN_REFRESH_BUFFER_SECONDS * 1000);

    return this.tokenExpiresAt <= refreshThreshold;
  }

  /**
   * Attempt to refresh the OAuth token if needed
   *
   * This is called automatically before API requests when tokens are about to expire.
   * It uses the configured refresh callback to obtain new tokens and reinitializes
   * the clients with the new access token.
   *
   * @returns True if refresh was successful or not needed, false if refresh failed
   */
  private async ensureValidToken(): Promise<boolean> {
    // Skip if no refresh callback or already refreshing
    if (!this.tokenRefreshCallback || this.isRefreshingToken) {
      return true;
    }

    // Skip if token doesn't need refresh
    if (!this.shouldRefreshToken()) {
      return true;
    }

    this.isRefreshingToken = true;
    logger.info('Token about to expire, attempting refresh...');

    try {
      const newAccessToken = await this.tokenRefreshCallback();

      if (!newAccessToken) {
        logger.error('Token refresh callback returned null');
        return false;
      }

      // Update the config with the new token
      if (this.config) {
        this.config.accessToken = newAccessToken;

        // Reinitialize clients with new token
        const clientConfig = this.buildClientConfig(this.config);
        this.client = new Version3Client(clientConfig);
        this.agileClient = new AgileClient(clientConfig);

        logger.info('Jira clients reinitialized with refreshed token');
      }

      return true;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      return false;
    } finally {
      this.isRefreshingToken = false;
    }
  }

  /**
   * Build jira.js Config from JiraConnectionConfig
   */
  private buildClientConfig(config: JiraConnectionConfig): Config {
    const clientConfig: Config = {
      host: config.host,
    };

    // Configure authentication based on method
    switch (config.authMethod) {
      case 'basic':
        if (config.email && config.apiToken) {
          clientConfig.authentication = {
            basic: {
              email: config.email,
              apiToken: config.apiToken,
            },
          };
        }
        break;

      case 'oauth2':
        if (config.accessToken) {
          clientConfig.authentication = {
            oauth2: {
              accessToken: config.accessToken,
            },
          };
        }
        break;

      case 'pat':
        if (config.personalAccessToken) {
          clientConfig.authentication = {
            personalAccessToken: config.personalAccessToken,
          };
        }
        break;
    }

    return clientConfig;
  }

  /**
   * Test the connection and retrieve current user information
   *
   * @returns Connection status with user info if successful
   */
  async testConnection(): Promise<JiraConnectionStatus> {
    if (!this.client) {
      this.connectionStatus = {
        connected: false,
        error: 'Jira client not initialized',
      };
      return this.connectionStatus;
    }

    try {
      const myself = await this.client.myself.getCurrentUser();

      this.connectionStatus = {
        connected: true,
        userDisplayName: myself.displayName,
        userAccountId: myself.accountId,
        lastConnectedAt: new Date().toISOString(),
      };

      logger.info(`Connected to Jira as: ${myself.displayName}`);
      return this.connectionStatus;
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.connectionStatus = {
        connected: false,
        error: message,
      };
      logger.error('Jira connection test failed:', message);
      return this.connectionStatus;
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): JiraConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Check if the service is connected
   */
  isConnected(): boolean {
    return this.connectionStatus.connected;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.client = null;
    this.agileClient = null;
    this.config = null;
    this.connectionStatus = { connected: false };
    logger.info('JiraService disconnected');
  }

  // ============================================================================
  // Issue Operations
  // ============================================================================

  /**
   * Get a single issue by key
   *
   * @param issueKey - Issue key (e.g., "PROJ-123")
   * @param options - Options for fetching additional data
   * @returns Simplified JiraIssue object
   */
  async getIssue(issueKey: string, options: GetIssueOptions = {}): Promise<JiraIssue> {
    await this.ensureConnected();

    const expand: string[] = ['names', 'renderedFields', ...(options.expand || [])];

    if (options.includeComments) {
      expand.push('changelog');
    }

    try {
      const issue = await this.client!.issues.getIssue({
        issueIdOrKey: issueKey,
        expand: expand.join(','),
      });

      const jiraIssue = this.mapIssue(issue);

      // Fetch comments separately if requested
      if (options.includeComments) {
        const commentsResult = await this.getIssueComments(issueKey, {
          maxResults: options.maxComments || 50,
        });
        jiraIssue.comments = commentsResult.comments;
        jiraIssue.commentCount = commentsResult.totalCount;
      }

      // Fetch links if requested
      if (options.includeLinks && issue.fields?.issuelinks) {
        jiraIssue.linkedIssues = this.mapIssueLinks(issue.fields.issuelinks);
      }

      return jiraIssue;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get issue ${issueKey}`);
    }
  }

  /**
   * Create a new issue
   *
   * @param options - Issue creation options
   * @returns Created issue
   */
  async createIssue(options: CreateIssueOptions): Promise<JiraIssue> {
    await this.ensureConnected();

    try {
      // Build fields object
      const fields: Version3Parameters.CreateIssue['fields'] = {
        project: { key: options.projectKey },
        summary: options.summary,
        issuetype: { name: options.issueTypeName },
      };

      if (options.description) {
        // Use ADF format for description
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: options.description }],
            },
          ],
        };
      }

      if (options.priority) {
        fields.priority = { name: options.priority };
      }

      if (options.assigneeAccountId) {
        fields.assignee = { accountId: options.assigneeAccountId };
      }

      if (options.labels) {
        fields.labels = options.labels;
      }

      if (options.components) {
        fields.components = options.components.map((name) => ({ name }));
      }

      if (options.fixVersions) {
        fields.fixVersions = options.fixVersions.map((name) => ({ name }));
      }

      const created = await this.client!.issues.createIssue({ fields });

      // Fetch the full issue to return
      return this.getIssue(created.key!);
    } catch (error) {
      throw this.handleApiError(error, 'Failed to create issue');
    }
  }

  /**
   * Update an existing issue
   *
   * @param issueKey - Issue key to update
   * @param updates - Fields to update
   * @returns Updated issue
   */
  async updateIssue(issueKey: string, updates: UpdateIssueOptions): Promise<JiraIssue> {
    await this.ensureConnected();

    try {
      const fields: Record<string, unknown> = {};

      if (updates.summary !== undefined) {
        fields.summary = updates.summary;
      }

      if (updates.description !== undefined) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: updates.description }],
            },
          ],
        };
      }

      if (updates.priority !== undefined) {
        fields.priority = { name: updates.priority };
      }

      if (updates.assigneeAccountId !== undefined) {
        fields.assignee = updates.assigneeAccountId
          ? { accountId: updates.assigneeAccountId }
          : null;
      }

      if (updates.labels !== undefined) {
        fields.labels = updates.labels;
      }

      if (updates.components !== undefined) {
        fields.components = updates.components.map((name) => ({ name }));
      }

      if (updates.fixVersions !== undefined) {
        fields.fixVersions = updates.fixVersions.map((name) => ({ name }));
      }

      await this.client!.issues.editIssue({
        issueIdOrKey: issueKey,
        fields,
      });

      // Fetch the updated issue to return
      return this.getIssue(issueKey);
    } catch (error) {
      throw this.handleApiError(error, `Failed to update issue ${issueKey}`);
    }
  }

  /**
   * Delete an issue
   *
   * @param issueKey - Issue key to delete
   * @param deleteSubtasks - Whether to delete subtasks (default: true)
   */
  async deleteIssue(issueKey: string, deleteSubtasks = true): Promise<void> {
    await this.ensureConnected();

    try {
      await this.client!.issues.deleteIssue({
        issueIdOrKey: issueKey,
        deleteSubtasks,
      });
      logger.info(`Deleted issue: ${issueKey}`);
    } catch (error) {
      throw this.handleApiError(error, `Failed to delete issue ${issueKey}`);
    }
  }

  /**
   * Transition an issue to a new status
   *
   * @param issueKey - Issue key
   * @param transitionId - Transition ID to execute
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.ensureConnected();

    try {
      await this.client!.issues.doTransition({
        issueIdOrKey: issueKey,
        transition: { id: transitionId },
      });
      logger.info(`Transitioned issue ${issueKey} with transition ${transitionId}`);
    } catch (error) {
      throw this.handleApiError(error, `Failed to transition issue ${issueKey}`);
    }
  }

  /**
   * Get available transitions for an issue
   *
   * @param issueKey - Issue key
   * @returns Array of available transitions
   */
  async getTransitions(
    issueKey: string
  ): Promise<Array<{ id: string; name: string; to: JiraStatus }>> {
    await this.ensureConnected();

    try {
      const result = await this.client!.issues.getTransitions({
        issueIdOrKey: issueKey,
      });

      return (result.transitions || []).map((t) => ({
        id: t.id!,
        name: t.name!,
        to: this.mapStatus(t.to!),
      }));
    } catch (error) {
      throw this.handleApiError(error, `Failed to get transitions for ${issueKey}`);
    }
  }

  // ============================================================================
  // Comment Operations
  // ============================================================================

  /**
   * Get comments for an issue
   *
   * @param issueKey - Issue key
   * @param options - Pagination options
   * @returns Paginated comments result
   */
  async getIssueComments(
    issueKey: string,
    options: { startAt?: number; maxResults?: number } = {}
  ): Promise<JiraCommentsResult> {
    await this.ensureConnected();

    try {
      const result = await this.client!.issueComments.getComments({
        issueIdOrKey: issueKey,
        startAt: options.startAt || 0,
        maxResults: options.maxResults || 50,
      });

      const comments = (result.comments || []).map((c) => this.mapComment(c));

      return {
        comments,
        totalCount: result.total || 0,
        startAt: result.startAt || 0,
        maxResults: result.maxResults || 50,
        hasMore: (result.startAt || 0) + comments.length < (result.total || 0),
      };
    } catch (error) {
      throw this.handleApiError(error, `Failed to get comments for ${issueKey}`);
    }
  }

  /**
   * Add a comment to an issue
   *
   * @param issueKey - Issue key
   * @param body - Comment body (plain text)
   * @returns Created comment
   */
  async addComment(issueKey: string, body: string): Promise<JiraComment> {
    await this.ensureConnected();

    try {
      const comment = await this.client!.issueComments.addComment({
        issueIdOrKey: issueKey,
        comment: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: body }],
            },
          ],
        },
      });

      // addComment returns void when no callback is provided, so we need to fetch the comment
      // For now, return a synthetic comment
      if (!comment) {
        // If no comment returned, fetch the latest comments and return the last one
        const commentsResult = await this.getIssueComments(issueKey, { maxResults: 1 });
        if (commentsResult.comments.length > 0) {
          return commentsResult.comments[0];
        }
        // If still no comment, return a placeholder
        const currentUser = await this.getCurrentUser();
        return {
          id: 'pending',
          author: currentUser,
          body: body,
          createdAt: new Date().toISOString(),
        };
      }

      return this.mapComment(comment);
    } catch (error) {
      throw this.handleApiError(error, `Failed to add comment to ${issueKey}`);
    }
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  /**
   * Search for issues using JQL
   *
   * @param request - Search request with JQL and pagination
   * @returns Search results with issues
   */
  async searchIssues(request: JiraSearchRequest): Promise<JiraSearchResult> {
    await this.ensureConnected();

    try {
      const result = await this.client!.issueSearch.searchForIssuesUsingJql({
        jql: request.jql,
        startAt: request.startAt || 0,
        maxResults: request.maxResults || 50,
        fields: request.fields || ['*navigable'],
        expand: request.expand?.join(','),
      });

      const issues = (result.issues || []).map((i) => this.mapIssue(i));

      return {
        issues,
        startAt: result.startAt || 0,
        maxResults: result.maxResults || 50,
        total: result.total || 0,
        hasMore: (result.startAt || 0) + issues.length < (result.total || 0),
      };
    } catch (error) {
      throw this.handleApiError(error, 'Failed to search issues');
    }
  }

  // ============================================================================
  // Project Operations
  // ============================================================================

  /**
   * Get a project by key
   *
   * @param projectKey - Project key
   * @returns Project details
   */
  async getProject(projectKey: string): Promise<JiraProject> {
    await this.ensureConnected();

    try {
      const project = await this.client!.projects.getProject({
        projectIdOrKey: projectKey,
        expand: 'description,lead,issueTypes,url',
      });

      return this.mapProject(project);
    } catch (error) {
      throw this.handleApiError(error, `Failed to get project ${projectKey}`);
    }
  }

  /**
   * Get all accessible projects
   *
   * @param options - Pagination options
   * @returns Array of projects
   */
  async getProjects(options: { startAt?: number; maxResults?: number } = {}): Promise<{
    projects: JiraProject[];
    total: number;
    hasMore: boolean;
  }> {
    await this.ensureConnected();

    try {
      const result = await this.client!.projects.searchProjects({
        startAt: options.startAt || 0,
        maxResults: options.maxResults || 50,
        expand: 'description,lead',
      });

      const projects = (result.values || []).map((p) => this.mapProject(p));

      return {
        projects,
        total: result.total || 0,
        hasMore: (result.startAt || 0) + projects.length < (result.total || 0),
      };
    } catch (error) {
      throw this.handleApiError(error, 'Failed to get projects');
    }
  }

  /**
   * Get issue types for a project
   *
   * @param projectKey - Project key
   * @returns Array of issue types
   */
  async getProjectIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
    await this.ensureConnected();

    try {
      const project = await this.client!.projects.getProject({
        projectIdOrKey: projectKey,
        expand: 'issueTypes',
      });

      return (project.issueTypes || []).map((t) => this.mapIssueType(t));
    } catch (error) {
      throw this.handleApiError(error, `Failed to get issue types for ${projectKey}`);
    }
  }

  /**
   * Get components for a project
   *
   * @param projectKey - Project key
   * @returns Array of components
   */
  async getProjectComponents(projectKey: string): Promise<JiraComponent[]> {
    await this.ensureConnected();

    try {
      const components = await this.client!.projectComponents.getProjectComponents({
        projectIdOrKey: projectKey,
      });

      return components.map((c) => ({
        id: c.id!,
        name: c.name!,
        description: c.description,
      }));
    } catch (error) {
      throw this.handleApiError(error, `Failed to get components for ${projectKey}`);
    }
  }

  /**
   * Get versions for a project
   *
   * @param projectKey - Project key
   * @returns Array of versions
   */
  async getProjectVersions(projectKey: string): Promise<JiraVersion[]> {
    await this.ensureConnected();

    try {
      const versions = await this.client!.projectVersions.getProjectVersions({
        projectIdOrKey: projectKey,
      });

      return versions.map((v) => this.mapVersion(v));
    } catch (error) {
      throw this.handleApiError(error, `Failed to get versions for ${projectKey}`);
    }
  }

  // ============================================================================
  // Agile Operations
  // ============================================================================

  /**
   * Get boards for a project
   *
   * @param projectKeyOrId - Project key or ID
   * @returns Array of boards
   */
  async getBoards(projectKeyOrId?: string): Promise<JiraBoard[]> {
    await this.ensureAgileConnected();

    try {
      const result = await this.agileClient!.board.getAllBoards({
        projectKeyOrId,
        maxResults: 100,
      });

      return (result.values || []).map((b) => ({
        id: b.id!,
        name: b.name!,
        type: b.type as 'scrum' | 'kanban' | string,
        projectKey: b.location?.projectKey,
      }));
    } catch (error) {
      throw this.handleApiError(error, 'Failed to get boards');
    }
  }

  /**
   * Get sprints for a board
   *
   * @param boardId - Board ID
   * @param state - Sprint state filter ('active', 'closed', 'future')
   * @returns Array of sprints
   */
  async getSprints(
    boardId: number,
    state?: 'active' | 'closed' | 'future'
  ): Promise<JiraSprint[]> {
    await this.ensureAgileConnected();

    try {
      const result = await this.agileClient!.board.getAllSprints({
        boardId,
        state,
        maxResults: 100,
      });

      return (result.values || []).map((s) => this.mapSprint(s, boardId));
    } catch (error) {
      throw this.handleApiError(error, `Failed to get sprints for board ${boardId}`);
    }
  }

  /**
   * Get issues in a sprint
   *
   * @param sprintId - Sprint ID
   * @param options - Pagination options
   * @returns Search result with issues
   */
  async getSprintIssues(
    sprintId: number,
    options: { startAt?: number; maxResults?: number } = {}
  ): Promise<JiraSearchResult> {
    await this.ensureAgileConnected();

    try {
      const result = await this.agileClient!.sprint.getIssuesForSprint({
        sprintId,
        startAt: options.startAt || 0,
        maxResults: options.maxResults || 50,
      });

      const issues = (result.issues || []).map((i) =>
        this.mapIssue(i as unknown as Version3Models.Issue)
      );

      return {
        issues,
        startAt: result.startAt || 0,
        maxResults: result.maxResults || 50,
        total: result.total || 0,
        hasMore: (result.startAt || 0) + issues.length < (result.total || 0),
      };
    } catch (error) {
      throw this.handleApiError(error, `Failed to get issues for sprint ${sprintId}`);
    }
  }

  /**
   * Move issues to a sprint
   *
   * @param sprintId - Target sprint ID
   * @param issueKeys - Issue keys to move
   */
  async moveIssuesToSprint(sprintId: number, issueKeys: string[]): Promise<void> {
    await this.ensureAgileConnected();

    try {
      await this.agileClient!.sprint.moveIssuesToSprintAndRank({
        sprintId,
        issues: issueKeys,
      });
      logger.info(`Moved ${issueKeys.length} issues to sprint ${sprintId}`);
    } catch (error) {
      throw this.handleApiError(error, `Failed to move issues to sprint ${sprintId}`);
    }
  }

  /**
   * Get all tasks from active sprints
   *
   * Finds all active sprints across boards (optionally filtered by project) and returns
   * all issues from those sprints. This is useful for getting a consolidated view of
   * current sprint work items.
   *
   * @param options - Options for filtering and pagination
   * @param options.projectKeyOrId - Optional project key or ID to filter boards
   * @param options.boardId - Optional specific board ID (if known, more efficient than searching)
   * @param options.maxResults - Maximum results per sprint (default 100)
   * @returns Object containing active sprints and their issues
   */
  async getActiveSprintTasks(
    options: {
      projectKeyOrId?: string;
      boardId?: number;
      maxResults?: number;
    } = {}
  ): Promise<{
    sprints: Array<{
      sprint: JiraSprint;
      board: JiraBoard;
      issues: JiraIssue[];
      total: number;
    }>;
    totalIssues: number;
  }> {
    await this.ensureAgileConnected();

    const { projectKeyOrId, boardId, maxResults = 100 } = options;
    const result: {
      sprints: Array<{
        sprint: JiraSprint;
        board: JiraBoard;
        issues: JiraIssue[];
        total: number;
      }>;
      totalIssues: number;
    } = {
      sprints: [],
      totalIssues: 0,
    };

    try {
      // If a specific board ID is provided, use it directly
      let boards: JiraBoard[];
      if (boardId) {
        // Get the specific board info
        const boardInfo = await this.agileClient!.board.getBoard({ boardId });
        boards = [{
          id: boardInfo.id!,
          name: boardInfo.name!,
          type: boardInfo.type as 'scrum' | 'kanban' | string,
          projectKey: boardInfo.location?.projectKey,
        }];
      } else {
        // Get all boards, optionally filtered by project
        boards = await this.getBoards(projectKeyOrId);
      }

      logger.debug(`Found ${boards.length} boards to check for active sprints`);

      // For each board, find active sprints and get their issues
      for (const board of boards) {
        // Only scrum boards have sprints
        if (board.type !== 'scrum') {
          logger.debug(`Skipping board ${board.id} (${board.name}) - not a scrum board`);
          continue;
        }

        try {
          // Get active sprints for this board
          const activeSprints = await this.getSprints(board.id, 'active');

          if (activeSprints.length === 0) {
            logger.debug(`No active sprints found for board ${board.id} (${board.name})`);
            continue;
          }

          logger.debug(`Found ${activeSprints.length} active sprint(s) for board ${board.id} (${board.name})`);

          // Get issues for each active sprint
          for (const sprint of activeSprints) {
            const sprintIssuesResult = await this.getSprintIssues(sprint.id, {
              maxResults,
            });

            result.sprints.push({
              sprint,
              board,
              issues: sprintIssuesResult.issues,
              total: sprintIssuesResult.total,
            });

            result.totalIssues += sprintIssuesResult.total;

            logger.debug(
              `Sprint ${sprint.id} (${sprint.name}) has ${sprintIssuesResult.total} issues`
            );
          }
        } catch (boardError) {
          // Log but don't fail - the board might not have sprints configured or user might not have access
          logger.warn(
            `Could not get active sprints for board ${board.id} (${board.name}): ${
              boardError instanceof Error ? boardError.message : String(boardError)
            }`
          );
        }
      }

      logger.info(
        `getActiveSprintTasks: Found ${result.totalIssues} total issues across ${result.sprints.length} active sprint(s)`
      );

      return result;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to get active sprint tasks');
    }
  }

  /**
   * Get the active sprint for a specific board
   *
   * Convenience method to get just the active sprint (if any) for a specific board.
   * Useful when you know which board you're working with.
   *
   * @param boardId - Board ID
   * @returns The active sprint or null if none is active
   */
  async getActiveSprint(boardId: number): Promise<JiraSprint | null> {
    await this.ensureAgileConnected();

    try {
      const activeSprints = await this.getSprints(boardId, 'active');

      if (activeSprints.length === 0) {
        return null;
      }

      // Typically there's only one active sprint per board, return the first one
      return activeSprints[0];
    } catch (error) {
      throw this.handleApiError(error, `Failed to get active sprint for board ${boardId}`);
    }
  }

  // ============================================================================
  // User Operations
  // ============================================================================

  /**
   * Search for users
   *
   * @param query - Search query
   * @param maxResults - Maximum results to return
   * @returns Array of users
   */
  async searchUsers(query: string, maxResults = 50): Promise<JiraUser[]> {
    await this.ensureConnected();

    try {
      const users = await this.client!.userSearch.findUsers({
        query,
        maxResults,
      });

      return users.map((u) => this.mapUser(u));
    } catch (error) {
      throw this.handleApiError(error, 'Failed to search users');
    }
  }

  /**
   * Get current user
   *
   * @returns Current authenticated user
   */
  async getCurrentUser(): Promise<JiraUser> {
    await this.ensureConnected();

    try {
      const user = await this.client!.myself.getCurrentUser();
      return this.mapUser(user);
    } catch (error) {
      throw this.handleApiError(error, 'Failed to get current user');
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Ensure the client is connected and token is valid
   *
   * Checks that the client is initialized and attempts to refresh
   * the OAuth token if it's about to expire.
   *
   * @throws JiraApiError if client not initialized or token refresh fails
   */
  private async ensureConnected(): Promise<void> {
    if (!this.client) {
      throw new JiraApiError('Jira client not initialized. Call initialize() first.');
    }

    // Attempt token refresh if needed
    const tokenValid = await this.ensureValidToken();
    if (!tokenValid) {
      throw new JiraApiError(
        'OAuth token expired and refresh failed. Please re-authenticate.',
        401
      );
    }
  }

  /**
   * Ensure the Agile client is connected and token is valid
   *
   * @throws JiraApiError if client not initialized or token refresh fails
   */
  private async ensureAgileConnected(): Promise<void> {
    if (!this.agileClient) {
      throw new JiraApiError('Jira Agile client not initialized. Call initialize() first.');
    }

    // Attempt token refresh if needed
    const tokenValid = await this.ensureValidToken();
    if (!tokenValid) {
      throw new JiraApiError(
        'OAuth token expired and refresh failed. Please re-authenticate.',
        401
      );
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      // Check for Axios error response
      const axiosError = error as { response?: { data?: { errorMessages?: string[] } } };
      if (axiosError.response?.data?.errorMessages?.length) {
        return axiosError.response.data.errorMessages.join(', ');
      }
      return error.message;
    }
    return String(error);
  }

  private handleApiError(error: unknown, context: string): JiraApiError {
    const message = this.extractErrorMessage(error);
    const axiosError = error as { response?: { status?: number; data?: { errorMessages?: string[] } } };

    logger.error(`${context}: ${message}`);

    return new JiraApiError(
      `${context}: ${message}`,
      axiosError.response?.status,
      axiosError.response?.data?.errorMessages
    );
  }

  // ============================================================================
  // Mapping Methods - Convert jira.js types to AutoMaker types
  // ============================================================================

  private mapIssue(issue: Version3Models.Issue): JiraIssue {
    const fields = issue.fields as Record<string, unknown> || {};

    return {
      id: issue.id,
      key: issue.key,
      summary: (fields.summary as string) || '',
      description: this.extractTextFromAdf(fields.description),
      descriptionAdf: fields.description,
      issueType: this.mapIssueType(fields.issuetype as Version3Models.IssueTypeDetails),
      status: this.mapStatus(fields.status as Version3Models.StatusDetails),
      priority: fields.priority ? this.mapPriority(fields.priority as Version3Models.Priority) : undefined,
      assignee: fields.assignee ? this.mapUser(fields.assignee as Version3Models.User) : undefined,
      reporter: this.mapUser(fields.reporter as Version3Models.User),
      creator: this.mapUser(fields.creator as Version3Models.User),
      labels: (fields.labels as string[]) || [],
      components: ((fields.components as Version3Models.ProjectComponent[]) || []).map((c) => ({
        id: c.id!,
        name: c.name!,
        description: c.description,
      })),
      fixVersions: ((fields.fixVersions as Version3Models.Version[]) || []).map((v) =>
        this.mapVersion(v)
      ),
      affectedVersions: fields.versions
        ? (fields.versions as Version3Models.Version[]).map((v) => this.mapVersion(v))
        : undefined,
      sprint: fields.sprint ? this.mapSprint(fields.sprint as Record<string, unknown>) : undefined,
      storyPoints: fields.customfield_10016 as number | undefined, // Common story points field
      epicKey: (fields.parent as { key?: string })?.key,
      epicName: (fields.parent as { fields?: { summary?: string } })?.fields?.summary,
      parentKey: (fields.parent as { key?: string })?.key,
      subtaskKeys: fields.subtasks
        ? (fields.subtasks as Array<{ key: string }>).map((s) => s.key)
        : undefined,
      dueDate: fields.duedate as string | undefined,
      createdAt: (fields.created as string) || new Date().toISOString(),
      updatedAt: (fields.updated as string) || new Date().toISOString(),
      webUrl: `${this.config?.host}/browse/${issue.key}`,
    };
  }

  private mapProject(project: Version3Models.Project): JiraProject {
    return {
      id: project.id!,
      key: project.key!,
      name: project.name!,
      description: project.description,
      lead: project.lead ? this.mapUser(project.lead) : undefined,
      category: project.projectCategory?.name,
      projectTypeKey: project.projectTypeKey,
      simplified: project.simplified,
      avatarUrl: project.avatarUrls?.['48x48'],
      issueTypes: project.issueTypes?.map((t) => this.mapIssueType(t)),
      webUrl: `${this.config?.host}/browse/${project.key}`,
    };
  }

  private mapUser(user: Version3Models.User | Version3Models.UserDetails | null | undefined): JiraUser {
    if (!user) {
      return {
        accountId: 'unknown',
        displayName: 'Unknown',
        active: false,
      };
    }

    return {
      accountId: user.accountId || 'unknown',
      displayName: user.displayName || 'Unknown',
      emailAddress: user.emailAddress,
      avatarUrl: user.avatarUrls?.['48x48'],
      active: user.active ?? true,
    };
  }

  private mapStatus(status: Version3Models.StatusDetails | null | undefined): JiraStatus {
    if (!status) {
      return {
        id: 'unknown',
        name: 'Unknown',
        statusCategory: 'indeterminate',
      };
    }

    return {
      id: status.id || 'unknown',
      name: status.name || 'Unknown',
      statusCategory: status.statusCategory?.key || 'indeterminate',
      colorName: status.statusCategory?.colorName,
    };
  }

  private mapPriority(priority: Version3Models.Priority): JiraPriority {
    return {
      id: priority.id!,
      name: priority.name!,
      iconUrl: priority.iconUrl,
    };
  }

  private mapIssueType(issueType: Version3Models.IssueTypeDetails | null | undefined): JiraIssueType {
    if (!issueType) {
      return {
        id: 'unknown',
        name: 'Unknown',
        subtask: false,
      };
    }

    return {
      id: issueType.id || 'unknown',
      name: issueType.name || 'Unknown',
      description: issueType.description,
      iconUrl: issueType.iconUrl,
      subtask: issueType.subtask || false,
    };
  }

  private mapVersion(version: Version3Models.Version): JiraVersion {
    return {
      id: version.id!,
      name: version.name!,
      released: version.released || false,
      releaseDate: version.releaseDate,
      archived: version.archived || false,
    };
  }

  private mapSprint(sprint: AgileModels.Sprint | Record<string, unknown>, boardId?: number): JiraSprint {
    return {
      id: (sprint as AgileModels.Sprint).id || (sprint as Record<string, unknown>).id as number,
      name: (sprint as AgileModels.Sprint).name || (sprint as Record<string, unknown>).name as string || '',
      state: ((sprint as AgileModels.Sprint).state || (sprint as Record<string, unknown>).state || 'future') as 'active' | 'closed' | 'future' | string,
      startDate: (sprint as AgileModels.Sprint).startDate || (sprint as Record<string, unknown>).startDate as string | undefined,
      endDate: (sprint as AgileModels.Sprint).endDate || (sprint as Record<string, unknown>).endDate as string | undefined,
      boardId: boardId || ((sprint as Record<string, unknown>).originBoardId as number | undefined),
    };
  }

  private mapComment(comment: Version3Models.Comment): JiraComment {
    return {
      id: comment.id!,
      author: this.mapUser(comment.author),
      body: this.extractTextFromAdf(comment.body),
      bodyAdf: comment.body,
      createdAt: comment.created!,
      updatedAt: comment.updated,
      updateAuthor: comment.updateAuthor ? this.mapUser(comment.updateAuthor) : undefined,
    };
  }

  private mapIssueLinks(links: Version3Models.IssueLink[]): JiraLinkedIssue[] {
    const result: JiraLinkedIssue[] = [];

    for (const link of links) {
      if (link.inwardIssue) {
        result.push({
          key: link.inwardIssue.key!,
          summary: link.inwardIssue.fields?.summary || '',
          linkType: link.type?.inward || 'related',
          direction: 'inward',
          status: this.mapStatus(link.inwardIssue.fields?.status),
        });
      }
      if (link.outwardIssue) {
        result.push({
          key: link.outwardIssue.key!,
          summary: link.outwardIssue.fields?.summary || '',
          linkType: link.type?.outward || 'related',
          direction: 'outward',
          status: this.mapStatus(link.outwardIssue.fields?.status),
        });
      }
    }

    return result;
  }

  /**
   * Extract plain text from Atlassian Document Format (ADF)
   */
  private extractTextFromAdf(adf: unknown): string {
    if (!adf) return '';
    if (typeof adf === 'string') return adf;

    const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> };
    if (!doc.content) return '';

    const textParts: string[] = [];

    const extractText = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;

      const n = node as { type?: string; text?: string; content?: unknown[] };

      if (n.type === 'text' && n.text) {
        textParts.push(n.text);
      }

      if (Array.isArray(n.content)) {
        for (const child of n.content) {
          extractText(child);
        }
      }
    };

    extractText(adf);
    return textParts.join(' ');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let jiraServiceInstance: JiraService | null = null;

/**
 * Get the singleton Jira service instance
 */
export function getJiraService(): JiraService {
  if (!jiraServiceInstance) {
    jiraServiceInstance = new JiraService();
  }
  return jiraServiceInstance;
}

/**
 * Create a new Jira service instance (useful for testing or multiple connections)
 */
export function createJiraService(): JiraService {
  return new JiraService();
}
