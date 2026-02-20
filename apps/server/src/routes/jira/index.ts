/**
 * Jira routes - HTTP API for Jira integration
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import { JiraService } from '../../services/jira-service.js';
import { createConnectionStatusHandler } from './routes/connection-status.js';
import { createConnectHandler } from './routes/connect.js';
import { createCallbackHandler } from './routes/callback.js';
import { createDisconnectHandler } from './routes/disconnect.js';
import { createBoardsHandler } from './routes/boards.js';
import { createSprintsHandler } from './routes/sprints.js';
import { createSprintIssuesHandler } from './routes/sprint-issues.js';
import { createImportIssuesHandler } from './routes/import-issues.js';

export function createJiraRoutes(
  settingsService: SettingsService,
  featureLoader: FeatureLoader
): Router {
  const router = Router();
  const jiraService = new JiraService(settingsService);

  // Connection management
  router.get('/status', createConnectionStatusHandler(jiraService));
  router.post('/connect', createConnectHandler(jiraService));
  router.get('/callback', createCallbackHandler(jiraService));
  router.post('/disconnect', createDisconnectHandler(jiraService));

  // Data fetching
  router.get('/boards', createBoardsHandler(jiraService));
  router.get('/boards/:boardId/sprints', createSprintsHandler(jiraService));
  router.post('/sprint-issues', createSprintIssuesHandler(jiraService));

  // Import
  router.post('/import', createImportIssuesHandler(jiraService, featureLoader));

  return router;
}
