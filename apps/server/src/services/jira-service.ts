/**
 * Jira Service
 *
 * Handles Jira OAuth 2.0 authentication and API operations for sprint task import.
 */

import path from 'path';
import * as fs from 'fs/promises';
import { createLogger } from '@automaker/utils';
import { getFeatureImagesDir } from '@automaker/platform';
import type {
  JiraConnectionStatus,
  JiraProject,
  JiraSprint,
  JiraIssue,
  JiraBoard,
  JiraSprintIssuesResponse,
  Credentials,
  FeatureImagePath,
} from '@automaker/types';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('JiraService');

// ============================================================================
// Configuration Constants
// ============================================================================

// Jira OAuth 2.0 configuration - read lazily to allow dotenv to load first
function getJiraClientId(): string {
  return process.env.JIRA_CLIENT_ID || '';
}
function getJiraClientSecret(): string {
  return process.env.JIRA_CLIENT_SECRET || '';
}
function getJiraRedirectUri(): string {
  return (
    process.env.JIRA_REDIRECT_URI ||
    `http://localhost:${process.env.PORT || 7008}/api/jira/callback`
  );
}

// Jira API endpoints
const JIRA_AUTH_URL = 'https://auth.atlassian.com/authorize';
const JIRA_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const JIRA_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

// Time constants
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

// API pagination limits
const MAX_BOARDS_PER_REQUEST = 100;
const MAX_SPRINTS_PER_REQUEST = 50;
const DEFAULT_MAX_ISSUES = 50;

// Jira custom field IDs (may vary by Jira instance)
const STORY_POINTS_FIELD_ID = 'customfield_10016';

// OAuth state storage (in-memory, cleared after use)
const pendingOAuthStates = new Map<string, { createdAt: number; returnUrl?: string }>();

// ============================================================================
// API Response Types (internal)
// ============================================================================

interface JiraTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface JiraResourceResponse {
  id: string;
  name: string;
  url: string;
}

interface JiraBoardResponse {
  id: number;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
  location?: {
    projectId?: number;
    projectKey?: string;
    projectName?: string;
  };
}

interface JiraSprintResponse {
  id: number;
  name: string;
  state: 'future' | 'active' | 'closed';
  startDate?: string;
  endDate?: string;
}

interface JiraIssueFieldsResponse {
  summary: string;
  description?: { content?: Array<{ content?: Array<{ text?: string }> }> };
  status: { id: string; name: string; statusCategory?: { key: string } };
  priority?: { id: string; name: string; iconUrl?: string };
  issuetype: { id: string; name: string; iconUrl?: string; subtask: boolean };
  assignee?: {
    accountId: string;
    displayName: string;
    emailAddress?: string;
    avatarUrls?: { '48x48'?: string };
  };
  reporter?: {
    accountId: string;
    displayName: string;
    emailAddress?: string;
    avatarUrls?: { '48x48'?: string };
  };
  [STORY_POINTS_FIELD_ID]?: number; // Story points
  labels?: string[];
  created: string;
  updated: string;
}

interface JiraIssueResponse {
  id: string;
  key: string;
  fields: JiraIssueFieldsResponse;
}

/**
 * Generate a random state string for OAuth CSRF protection
 */
function generateOAuthState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Clean up expired OAuth states
 */
function cleanupStaleStates(): void {
  const now = Date.now();
  for (const [state, data] of pendingOAuthStates.entries()) {
    if (now - data.createdAt > OAUTH_STATE_TTL_MS) {
      pendingOAuthStates.delete(state);
    }
  }
}

export class JiraService {
  private settingsService: SettingsService;

  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;

    // Clean up stale states periodically
    this.cleanupInterval = setInterval(cleanupStaleStates, OAUTH_STATE_TTL_MS);
  }

  /**
   * Clean up resources when service is destroyed
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Check if Jira OAuth is configured (client ID and secret are set)
   */
  isConfigured(): boolean {
    return !!(getJiraClientId() && getJiraClientSecret());
  }

  /**
   * Get the OAuth authorization URL
   */
  getAuthorizationUrl(returnUrl?: string): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new Error('Jira OAuth is not configured. Set JIRA_CLIENT_ID and JIRA_CLIENT_SECRET.');
    }

    const state = generateOAuthState();
    pendingOAuthStates.set(state, { createdAt: Date.now(), returnUrl });

    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: getJiraClientId(),
      scope:
        'read:jira-work read:sprint:jira-software read:board-scope:jira-software read:project:jira offline_access',
      redirect_uri: getJiraRedirectUri(),
      state,
      response_type: 'code',
      prompt: 'consent',
    });

    return {
      url: `${JIRA_AUTH_URL}?${params.toString()}`,
      state,
    };
  }

  /**
   * Validate an OAuth state parameter
   */
  validateState(state: string): { valid: boolean; returnUrl?: string } {
    const data = pendingOAuthStates.get(state);
    if (!data) {
      return { valid: false };
    }

    // Check if state is expired
    if (Date.now() - data.createdAt > OAUTH_STATE_TTL_MS) {
      pendingOAuthStates.delete(state);
      return { valid: false };
    }

    // Remove state after validation (one-time use)
    pendingOAuthStates.delete(state);
    return { valid: true, returnUrl: data.returnUrl };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    if (!this.isConfigured()) {
      throw new Error('Jira OAuth is not configured.');
    }

    const response = await fetch(JIRA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: getJiraClientId(),
        client_secret: getJiraClientSecret(),
        code,
        redirect_uri: getJiraRedirectUri(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to exchange code for tokens:', errorText);
      throw new Error(`Failed to exchange code for tokens: ${response.status}`);
    }

    const data = (await response.json()) as JiraTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refresh an expired access token
   */
  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    if (!this.isConfigured()) {
      throw new Error('Jira OAuth is not configured.');
    }

    const response = await fetch(JIRA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: getJiraClientId(),
        client_secret: getJiraClientSecret(),
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to refresh token:', errorText);
      throw new Error(`Failed to refresh token: ${response.status}`);
    }

    const data = (await response.json()) as JiraTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Some providers don't return a new refresh token
      expiresIn: data.expires_in,
    };
  }

  /**
   * Get accessible Jira resources (sites) for the authenticated user
   */
  async getAccessibleResources(
    accessToken: string
  ): Promise<Array<{ id: string; name: string; url: string }>> {
    const response = await fetch(JIRA_RESOURCES_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get accessible resources: ${response.status}`);
    }

    const resources = (await response.json()) as JiraResourceResponse[];
    return resources.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
    }));
  }

  /**
   * Get a valid access token, refreshing if necessary
   * @returns The access token and cloud ID, or null if not connected
   * @throws Error if token refresh fails (will also disconnect)
   */
  private async getValidAccessToken(): Promise<{ accessToken: string; cloudId: string } | null> {
    const credentials = await this.settingsService.getCredentials();
    if (!credentials.jira) {
      return null;
    }

    const { accessToken, refreshToken, expiresAt, cloudId } = credentials.jira;

    // Check if token is expired (with buffer before expiry)
    const expiresAtDate = new Date(expiresAt);
    const now = new Date();

    if (expiresAtDate.getTime() - now.getTime() < TOKEN_REFRESH_BUFFER_MS) {
      // Token is expired or about to expire, refresh it
      try {
        const newTokens = await this.refreshAccessToken(refreshToken);
        const newExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000).toISOString();

        await this.settingsService.updateCredentials({
          ...credentials,
          jira: {
            ...credentials.jira,
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            expiresAt: newExpiresAt,
          },
        });

        return { accessToken: newTokens.accessToken, cloudId };
      } catch (error) {
        logger.error('Failed to refresh Jira token:', error);
        // Clear credentials on refresh failure
        await this.disconnectJira();
        return null;
      }
    }

    return { accessToken, cloudId };
  }

  /**
   * Make an authenticated request to Jira REST API
   * @param cloudId - The Jira cloud instance ID
   * @param accessToken - OAuth access token
   * @param endpoint - API endpoint (e.g., '/rest/api/3/myself')
   * @param options - Fetch options
   * @returns Parsed JSON response
   * @throws Error if request fails
   */
  private async jiraApiRequest<T>(
    cloudId: string,
    accessToken: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}`;
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an authenticated request to Jira Agile API (for boards, sprints, etc.)
   * @param cloudId - The Jira cloud instance ID
   * @param accessToken - OAuth access token
   * @param endpoint - Agile API endpoint (e.g., '/board', '/sprint/123/issue')
   * @param options - Fetch options
   * @returns Parsed JSON response
   * @throws Error if request fails
   */
  private async jiraAgileApiRequest<T>(
    cloudId: string,
    accessToken: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0`;
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira Agile API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get Jira connection status
   */
  async getConnectionStatus(): Promise<JiraConnectionStatus> {
    const configured = this.isConfigured();
    const credentials = await this.settingsService.getCredentials();

    if (!credentials.jira) {
      return { configured, connected: false };
    }

    // Try to validate the token by making a simple API call
    try {
      const tokenData = await this.getValidAccessToken();
      if (!tokenData) {
        return { configured, connected: false };
      }

      // Verify the token is actually valid using an endpoint covered by our scopes.
      // We use /rest/api/3/project/search (read:project:jira scope) instead of
      // /rest/api/3/myself which requires the read:me scope we don't request.
      await this.jiraApiRequest(
        tokenData.cloudId,
        tokenData.accessToken,
        '/rest/api/3/project/search?maxResults=1'
      );

      return {
        configured,
        connected: true,
        siteUrl: credentials.jira.siteUrl,
        siteName: credentials.jira.siteName,
      };
    } catch (error) {
      logger.error('Failed to validate Jira connection:', error);
      // Auto-disconnect on validation failure so UI reflects actual state
      await this.disconnectJira().catch(() => {});
      return {
        configured,
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Save Jira credentials after successful OAuth
   */
  async saveJiraCredentials(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    cloudId: string,
    siteUrl: string,
    siteName: string
  ): Promise<void> {
    const credentials = await this.settingsService.getCredentials();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await this.settingsService.updateCredentials({
      ...credentials,
      jira: {
        cloudId,
        accessToken,
        refreshToken,
        expiresAt,
        siteUrl,
        siteName,
      },
    });

    logger.info(`Jira connected to ${siteName} (${siteUrl})`);
  }

  /**
   * Disconnect Jira (remove credentials)
   */
  async disconnectJira(): Promise<void> {
    const credentials = await this.settingsService.getCredentials();
    const { jira, ...rest } = credentials;

    await this.settingsService.updateCredentials({
      ...rest,
      jira: undefined,
    } as Credentials);

    logger.info('Jira disconnected');
  }

  /**
   * Get boards for the connected Jira site
   */
  async getBoards(): Promise<JiraBoard[]> {
    const tokenData = await this.getValidAccessToken();
    if (!tokenData) {
      throw new Error('Not connected to Jira');
    }

    const { accessToken, cloudId } = tokenData;

    const response = await this.jiraAgileApiRequest<{ values: JiraBoardResponse[] }>(
      cloudId,
      accessToken,
      `/board?maxResults=${MAX_BOARDS_PER_REQUEST}`
    );

    return response.values.map((board) => ({
      id: board.id,
      name: board.name,
      type: board.type,
      project:
        board.location?.projectId && board.location.projectKey && board.location.projectName
          ? {
              id: board.location.projectId.toString(),
              key: board.location.projectKey,
              name: board.location.projectName,
            }
          : undefined,
    }));
  }

  /**
   * Get sprints for a board.
   * Falls back to JQL-based discovery when the Agile API returns 401/403
   * (common with "simple"/team-managed boards that don't support granular OAuth scopes).
   */
  async getSprints(boardId: number, state?: 'active' | 'future' | 'closed'): Promise<JiraSprint[]> {
    const tokenData = await this.getValidAccessToken();
    if (!tokenData) {
      throw new Error('Not connected to Jira');
    }

    const { accessToken, cloudId } = tokenData;

    // Try the Agile API first
    try {
      const stateParam = state ? `&state=${state}` : '';
      const response = await this.jiraAgileApiRequest<{ values: JiraSprintResponse[] }>(
        cloudId,
        accessToken,
        `/board/${boardId}/sprint?maxResults=${MAX_SPRINTS_PER_REQUEST}${stateParam}`
      );

      return response.values.map((sprint) => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        boardId,
      }));
    } catch (error) {
      // Fall back to JQL for 401/403 errors (scope mismatch on simple/team-managed boards)
      const errorMsg = error instanceof Error ? error.message : '';
      if (!errorMsg.includes('(401)') && !errorMsg.includes('(403)')) {
        throw error;
      }
      logger.warn(
        `Agile API sprint fetch failed for board ${boardId}, falling back to JQL: ${errorMsg}`
      );
    }

    return this.getSprintsViaJql(boardId, state, cloudId, accessToken);
  }

  /**
   * Discover sprints via JQL search (REST API v3 fallback).
   * Uses `sprint in openSprints()` or `sprint in closedSprints()` to find sprint info
   * from issue fields, which only requires the `read:jira-work` scope.
   */
  private async getSprintsViaJql(
    boardId: number,
    state: 'active' | 'future' | 'closed' | undefined,
    cloudId: string,
    accessToken: string
  ): Promise<JiraSprint[]> {
    // Find the project key for this board
    const boards = await this.getBoards();
    const board = boards.find((b) => b.id === boardId);
    const projectKey = board?.project?.key;
    if (!projectKey) {
      logger.warn(`Cannot determine project key for board ${boardId}, returning empty sprints`);
      return [];
    }

    // Build JQL to find issues with sprint info
    let sprintJql: string;
    if (state === 'active') {
      sprintJql = `sprint in openSprints() AND project = "${projectKey}"`;
    } else if (state === 'closed') {
      sprintJql = `sprint in closedSprints() AND project = "${projectKey}"`;
    } else if (state === 'future') {
      sprintJql = `sprint in futureSprints() AND project = "${projectKey}"`;
    } else {
      // All sprints: open + closed + future
      sprintJql = `sprint is not EMPTY AND project = "${projectKey}"`;
    }

    const response = await this.jiraApiRequest<{
      issues: Array<{
        fields: {
          sprint?: {
            id: number;
            name: string;
            state: string;
            startDate?: string;
            endDate?: string;
          };
          closedSprints?: Array<{
            id: number;
            name: string;
            state: string;
            startDate?: string;
            endDate?: string;
          }>;
        };
      }>;
    }>(cloudId, accessToken, '/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify({
        jql: sprintJql,
        maxResults: MAX_SPRINTS_PER_REQUEST,
        fields: ['sprint', 'closedSprints'],
      }),
    });

    // Extract unique sprints from issue fields
    const sprintMap = new Map<number, JiraSprint>();

    for (const issue of response.issues) {
      const { sprint: activeSprint, closedSprints } = issue.fields;

      if (activeSprint && !sprintMap.has(activeSprint.id)) {
        sprintMap.set(activeSprint.id, {
          id: activeSprint.id,
          name: activeSprint.name,
          state: activeSprint.state as 'active' | 'future' | 'closed',
          startDate: activeSprint.startDate,
          endDate: activeSprint.endDate,
          boardId,
        });
      }

      if (closedSprints) {
        for (const cs of closedSprints) {
          if (!sprintMap.has(cs.id)) {
            sprintMap.set(cs.id, {
              id: cs.id,
              name: cs.name,
              state: cs.state as 'active' | 'future' | 'closed',
              startDate: cs.startDate,
              endDate: cs.endDate,
              boardId,
            });
          }
        }
      }
    }

    const sprints = Array.from(sprintMap.values());

    // Filter by state if requested (the JQL already filters, but sprint field may include extras)
    if (state) {
      return sprints.filter((s) => s.state === state);
    }

    return sprints;
  }

  /**
   * Get active sprint for a board
   */
  async getActiveSprint(boardId: number): Promise<JiraSprint | null> {
    const sprints = await this.getSprints(boardId, 'active');
    return sprints[0] || null;
  }

  /**
   * Get issues in a sprint.
   * Falls back to REST API v3 JQL search when the Agile API returns 401/403
   * (common with "simple"/team-managed boards).
   */
  async getSprintIssues(
    sprintId: number,
    statusFilter: 'todo' | 'indeterminate' | 'all' = 'todo',
    maxResults: number = DEFAULT_MAX_ISSUES
  ): Promise<{ issues: JiraIssue[]; total: number }> {
    const tokenData = await this.getValidAccessToken();
    if (!tokenData) {
      throw new Error('Not connected to Jira');
    }

    const { accessToken, cloudId } = tokenData;
    const credentials = await this.settingsService.getCredentials();
    const siteUrl = credentials.jira?.siteUrl || '';

    // Build JQL filter
    let jql = `sprint=${sprintId}`;
    if (statusFilter === 'todo') {
      jql += ' AND statusCategory = "To Do"';
    } else if (statusFilter === 'indeterminate') {
      jql += ' AND statusCategory = "In Progress"';
    }

    const fields = `summary,description,status,priority,issuetype,assignee,reporter,labels,created,updated,${STORY_POINTS_FIELD_ID}`;

    // Try the Agile API first
    try {
      const response = await this.jiraAgileApiRequest<{
        issues: JiraIssueResponse[];
        total: number;
      }>(
        cloudId,
        accessToken,
        `/sprint/${sprintId}/issue?maxResults=${maxResults}&jql=${encodeURIComponent(jql)}&fields=${fields}`
      );

      const issues: JiraIssue[] = response.issues.map((issue) =>
        this.mapIssueResponseToJiraIssue(issue, siteUrl)
      );

      return { issues, total: response.total };
    } catch (error) {
      // Fall back to REST API v3 for 401/403 errors (scope mismatch on simple/team-managed boards)
      const errorMsg = error instanceof Error ? error.message : '';
      if (!errorMsg.includes('(401)') && !errorMsg.includes('(403)')) {
        throw error;
      }
      logger.warn(`Agile API sprint issues fetch failed, falling back to JQL search: ${errorMsg}`);
    }

    // Fallback: use REST API v3 search/jql with JQL (only needs read:jira-work scope)
    const response = await this.jiraApiRequest<{ issues: JiraIssueResponse[]; total: number }>(
      cloudId,
      accessToken,
      '/rest/api/3/search/jql',
      {
        method: 'POST',
        body: JSON.stringify({
          jql,
          maxResults,
          fields: fields.split(','),
        }),
      }
    );

    const issues: JiraIssue[] = response.issues.map((issue) =>
      this.mapIssueResponseToJiraIssue(issue, siteUrl)
    );

    return { issues, total: response.total };
  }

  /**
   * Map Jira status category key to our simplified status type
   * @param key - Jira status category key ('new', 'done', 'indeterminate', etc.)
   * @returns Simplified status: 'todo', 'indeterminate', or 'done'
   */
  private mapStatusCategory(key: string | undefined): 'todo' | 'indeterminate' | 'done' {
    switch (key) {
      case 'new':
      case 'undefined':
      case undefined:
        return 'todo';
      case 'done':
        return 'done';
      default:
        return 'indeterminate';
    }
  }

  /**
   * Map Jira API issue response to our JiraIssue type
   * @param issue - Raw issue response from Jira API
   * @param siteUrl - Base URL of the Jira site for constructing issue links
   * @returns Normalized JiraIssue object
   */
  private mapIssueResponseToJiraIssue(issue: JiraIssueResponse, siteUrl: string): JiraIssue {
    const { fields } = issue;

    // Parse Atlassian Document Format description to plain text
    const descriptionText =
      fields.description?.content
        ?.map((block) => block.content?.map((c) => c.text || '').join('') || '')
        .join('\n') || '';

    return {
      id: issue.id,
      key: issue.key,
      summary: fields.summary,
      description: descriptionText,
      status: {
        id: fields.status.id,
        name: fields.status.name,
        statusCategory: this.mapStatusCategory(fields.status.statusCategory?.key),
      },
      priority: fields.priority
        ? {
            id: fields.priority.id,
            name: fields.priority.name,
            iconUrl: fields.priority.iconUrl,
          }
        : undefined,
      issueType: {
        id: fields.issuetype.id,
        name: fields.issuetype.name,
        iconUrl: fields.issuetype.iconUrl,
        subtask: fields.issuetype.subtask,
      },
      assignee: fields.assignee
        ? {
            accountId: fields.assignee.accountId,
            displayName: fields.assignee.displayName,
            emailAddress: fields.assignee.emailAddress,
            avatarUrl: fields.assignee.avatarUrls?.['48x48'],
          }
        : undefined,
      reporter: fields.reporter
        ? {
            accountId: fields.reporter.accountId,
            displayName: fields.reporter.displayName,
            emailAddress: fields.reporter.emailAddress,
            avatarUrl: fields.reporter.avatarUrls?.['48x48'],
          }
        : undefined,
      storyPoints: fields[STORY_POINTS_FIELD_ID],
      labels: fields.labels || [],
      created: fields.created,
      updated: fields.updated,
      url: `${siteUrl}/browse/${issue.key}`,
    };
  }

  /**
   * Get sprint issues with board auto-detection
   */
  async getSprintIssuesForProject(options: {
    boardId?: number;
    sprintId?: number;
    statusFilter?: 'todo' | 'indeterminate' | 'all';
    maxResults?: number;
  }): Promise<JiraSprintIssuesResponse> {
    let { boardId, sprintId, statusFilter = 'todo', maxResults = DEFAULT_MAX_ISSUES } = options;

    // If no board specified, auto-select: prefer scrum boards (have sprints), fall back to any
    if (!boardId) {
      const boards = await this.getBoards();
      const scrumBoard = boards.find((b) => b.type === 'scrum');
      const selectedBoard = scrumBoard || boards[0];
      if (!selectedBoard) {
        throw new Error('No board found in connected Jira site');
      }
      boardId = selectedBoard.id;
    }

    // If no sprint specified, get the active sprint
    let sprint: JiraSprint | null = null;
    if (!sprintId) {
      sprint = await this.getActiveSprint(boardId);
      if (!sprint) {
        // Return empty response when no active sprint found (better UX than throwing)
        return {
          sprint: undefined,
          issues: [],
          total: 0,
          hasMore: false,
        };
      }
      sprintId = sprint.id;
    } else {
      // Get sprint details
      const sprints = await this.getSprints(boardId);
      sprint = sprints.find((s) => s.id === sprintId) || null;
      if (!sprint) {
        throw new Error(`Sprint ${sprintId} not found`);
      }
    }

    const { issues, total } = await this.getSprintIssues(sprintId, statusFilter, maxResults);

    return {
      sprint,
      issues,
      total,
      hasMore: total > issues.length,
    };
  }

  /**
   * Download image attachments for a Jira issue directly to the feature images directory.
   * @param issueKey - Jira issue key (e.g., PROJ-123)
   * @param projectPath - Absolute path to the project
   * @param featureId - Pre-generated feature ID for the target directory
   * @returns Downloaded image file metadata (FeatureImagePath objects)
   */
  async downloadIssueImageAttachments(
    issueKey: string,
    projectPath: string,
    featureId: string
  ): Promise<FeatureImagePath[]> {
    const tokenData = await this.getValidAccessToken();
    if (!tokenData) {
      throw new Error('Not connected to Jira');
    }

    const { accessToken, cloudId } = tokenData;

    // Fetch attachment metadata for the issue
    const issueData = await this.jiraApiRequest<{
      fields: {
        attachment?: Array<{
          id: string;
          filename: string;
          mimeType: string;
          size: number;
          content: string; // Direct download URL
        }>;
      };
    }>(cloudId, accessToken, `/rest/api/3/issue/${issueKey}?fields=attachment`);

    const attachments = issueData.fields.attachment || [];

    // Filter to supported image types only
    const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    const imageAttachments = attachments.filter((a) => IMAGE_MIME_TYPES.has(a.mimeType));

    if (imageAttachments.length === 0) {
      return [];
    }

    // Write directly to the feature images directory (skipping temp)
    const imagesDir = getFeatureImagesDir(projectPath, featureId);
    await fs.mkdir(imagesDir, { recursive: true });

    const downloadedPaths: FeatureImagePath[] = [];

    for (const attachment of imageAttachments) {
      try {
        // The content URL requires OAuth Bearer auth
        const response = await fetch(attachment.content, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          logger.warn(
            `Failed to download attachment ${attachment.filename} for ${issueKey}: HTTP ${response.status}`
          );
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Use attachment ID in filename for uniqueness, sanitize for safety
        const ext = path.extname(attachment.filename) || '.png';
        const baseName = path.basename(attachment.filename, ext).replace(/[^a-zA-Z0-9._\-]/g, '_');
        const uniqueFilename = `${baseName}-${attachment.id}${ext}`;
        const filePath = path.join(imagesDir, uniqueFilename);

        await fs.writeFile(filePath, buffer);
        downloadedPaths.push({
          id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          path: filePath,
          filename: uniqueFilename,
          mimeType: attachment.mimeType,
        });

        logger.info(`Downloaded Jira attachment: ${attachment.filename} for ${issueKey}`);
      } catch (error) {
        logger.warn(`Failed to download attachment ${attachment.filename} for ${issueKey}:`, error);
      }
    }

    return downloadedPaths;
  }
}
