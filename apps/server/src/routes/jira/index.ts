/**
 * Jira routes - HTTP API for Jira integration
 *
 * Provides endpoints for:
 * - OAuth authentication with Jira Cloud
 * - Basic Auth / PAT authentication (non-OAuth)
 * - Connection status checking
 * - Connection management (disconnect)
 * - Project listing
 * - Issue search and retrieval
 * - Board and sprint management
 * - Sprint tasks (active sprint issues)
 * - Import tasks (create features from Jira issues)
 * - Issue-to-feature validations (mappings)
 *
 * OAuth Flow:
 * 1. GET /api/jira/auth - Redirects to Atlassian authorization page
 * 2. GET /api/jira/auth/callback - Handles OAuth callback, exchanges code for tokens
 * 3. GET /api/jira/auth/status - Check authentication status
 * 4. POST /api/jira/auth/refresh - Manually refresh OAuth tokens
 *
 * Non-OAuth Connection:
 * - POST /api/jira/auth/connect - Connect using Basic Auth or PAT
 *
 * Connection Status:
 * - GET /api/jira/status - Check Jira connection status
 *
 * Connection Management:
 * - DELETE /api/jira/connection - Disconnect Jira integration
 *
 * Projects:
 * - GET /api/jira/projects - List accessible Jira projects
 *
 * Issues:
 * - POST /api/jira/issues/search - Search issues with JQL
 * - GET /api/jira/issues/:issueKey - Get a single issue
 * - GET /api/jira/issues/:issueKey/comments - Get comments for an issue
 *
 * Boards and Sprints:
 * - GET /api/jira/boards - List Jira boards
 * - GET /api/jira/boards/:boardId/sprints - List sprints for a board
 * - GET /api/jira/sprints/:sprintId/issues - Get issues in a sprint
 *
 * Sprint Tasks:
 * - GET /api/jira/sprint/tasks - Get tasks from active sprints
 *
 * Import Tasks:
 * - POST /api/jira/import - Import Jira issues as features
 *
 * Validations (Issue-Feature Mappings):
 * - GET /api/jira/validations - List all mappings for a project
 * - GET /api/jira/validations/:issueKey - Get mapping for a specific issue
 * - DELETE /api/jira/validations/:issueKey - Delete a mapping
 *
 * @see ../lib/passport-atlassian.ts for OAuth2 configuration
 */

import { Router } from 'express';
import {
  createAuthInitHandler,
  createAuthStatusHandler,
  createAuthCallbackHandler,
  createAuthRefreshHandler,
} from './routes/auth.js';
import { createStatusHandler } from './routes/status.js';
import { createDisconnectHandler } from './routes/disconnect.js';
import { createSprintTasksHandler } from './routes/sprint-tasks.js';
import { createImportTasksHandler } from './routes/import-tasks.js';
import { createProjectsHandler } from './routes/projects.js';
import {
  createSearchIssuesHandler,
  createGetIssueHandler,
  createGetIssueCommentsHandler,
} from './routes/issues.js';
import {
  createListBoardsHandler,
  createListSprintsHandler,
  createGetSprintIssuesHandler,
} from './routes/boards.js';
import { createConnectHandler } from './routes/connect.js';
import {
  createListValidationsHandler,
  createGetValidationHandler,
  createDeleteValidationHandler,
} from './routes/validations.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { EventEmitter } from '../../lib/events.js';

/**
 * Create Jira API routes
 *
 * @param settingsService - Settings service for reading stored credentials
 * @param featureLoader - Feature loader for creating features from Jira issues
 * @param events - Event emitter for feature events
 * @returns Express Router with Jira endpoints
 */
export function createJiraRoutes(
  settingsService?: SettingsService,
  featureLoader?: FeatureLoader,
  events?: EventEmitter
): Router {
  const router = Router();

  // ============================================================================
  // Connection Status
  // ============================================================================

  // GET /api/jira/status - Check Jira connection status
  router.get('/status', createStatusHandler(settingsService));

  // ============================================================================
  // OAuth Authentication Routes
  // ============================================================================

  // GET /api/jira/auth - Initiate OAuth flow
  // Redirects user to Atlassian authorization page
  router.get('/auth', createAuthInitHandler());

  // GET /api/jira/auth/status - Check OAuth configuration and authentication status
  router.get('/auth/status', createAuthStatusHandler());

  // GET /api/jira/auth/callback - Handle OAuth callback from Atlassian
  // This completes the OAuth flow and stores the tokens
  router.get('/auth/callback', createAuthCallbackHandler(settingsService));

  // POST /api/jira/auth/refresh - Manually refresh OAuth tokens
  // Used to proactively refresh tokens before they expire
  router.post('/auth/refresh', createAuthRefreshHandler(settingsService));

  // POST /api/jira/auth/connect - Connect using Basic Auth or PAT
  // Body: { authMethod: 'basic'|'pat', host, email?, apiToken?, personalAccessToken? }
  router.post('/auth/connect', createConnectHandler(settingsService));

  // ============================================================================
  // Connection Management
  // ============================================================================

  // DELETE /api/jira/connection - Disconnect Jira integration
  // Query params: ?connectionId=xxx (optional) or ?all=true to remove all connections
  router.delete('/connection', createDisconnectHandler(settingsService));

  // ============================================================================
  // Projects
  // ============================================================================

  // GET /api/jira/projects - List accessible Jira projects
  // Query params: ?startAt=0 (optional), ?maxResults=50 (optional)
  router.get('/projects', createProjectsHandler(settingsService));

  // ============================================================================
  // Issues
  // ============================================================================

  // POST /api/jira/issues/search - Search issues with JQL
  // Body: { jql, startAt?, maxResults?, fields?, expand? }
  router.post('/issues/search', createSearchIssuesHandler(settingsService));

  // GET /api/jira/issues/:issueKey - Get a single issue
  // Query params: ?includeComments=true (optional), ?includeLinks=true (optional)
  router.get('/issues/:issueKey', createGetIssueHandler(settingsService));

  // GET /api/jira/issues/:issueKey/comments - Get comments for an issue
  // Query params: ?startAt=0 (optional), ?maxResults=50 (optional)
  router.get('/issues/:issueKey/comments', createGetIssueCommentsHandler(settingsService));

  // ============================================================================
  // Boards and Sprints
  // ============================================================================

  // GET /api/jira/boards - List Jira boards
  // Query params: ?projectKey=XXX (optional)
  router.get('/boards', createListBoardsHandler(settingsService));

  // GET /api/jira/boards/:boardId/sprints - List sprints for a board
  // Query params: ?state=active|future|closed (optional)
  router.get('/boards/:boardId/sprints', createListSprintsHandler(settingsService));

  // GET /api/jira/sprints/:sprintId/issues - Get issues in a sprint
  // Query params: ?startAt=0 (optional), ?maxResults=50 (optional)
  router.get('/sprints/:sprintId/issues', createGetSprintIssuesHandler(settingsService));

  // ============================================================================
  // Sprint Tasks (Legacy/Convenience)
  // ============================================================================

  // GET /api/jira/sprint/tasks - Get tasks from active sprints
  // Query params: ?projectKey=XXX (optional), ?boardId=123 (optional), ?maxResults=50 (optional)
  router.get('/sprint/tasks', createSprintTasksHandler(settingsService));

  // ============================================================================
  // Import Tasks
  // ============================================================================

  // POST /api/jira/import - Import Jira issues as features
  // Body: { projectPath: string, issueKeys: string[], options?: { includeComments?, includeDependencies?, skipDuplicates? } }
  router.post(
    '/import',
    validatePathParams('projectPath'),
    createImportTasksHandler(settingsService, featureLoader, events)
  );

  // ============================================================================
  // Validations (Issue-Feature Mappings)
  // ============================================================================

  // GET /api/jira/validations - List all mappings for a project
  // Query params: ?projectPath=xxx (required), ?issueKey=xxx (optional)
  router.get('/validations', createListValidationsHandler());

  // GET /api/jira/validations/:issueKey - Get mapping for a specific issue
  // Query params: ?projectPath=xxx (required)
  router.get('/validations/:issueKey', createGetValidationHandler());

  // DELETE /api/jira/validations/:issueKey - Delete a mapping
  // Query params: ?projectPath=xxx (required)
  router.delete('/validations/:issueKey', createDeleteValidationHandler());

  return router;
}
