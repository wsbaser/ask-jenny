/**
 * Unit tests for JiraService
 *
 * Tests the Jira API wrapper service. Due to the complexity of mocking jira.js,
 * these tests focus on:
 * - Service initialization and configuration
 * - Connection status management
 * - Error class behavior
 *
 * For end-to-end testing with real Jira, integration tests should be used.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  JiraService,
  createJiraService,
  JiraApiError,
} from '@/services/jira-service.js';
import type { JiraConnectionConfig } from '@automaker/types';

// Mock jira.js with constructable classes
vi.mock('jira.js', () => {
  class MockVersion3Client {
    myself = {
      getCurrentUser: vi.fn(),
    };
    issues = {
      getIssue: vi.fn(),
      createIssue: vi.fn(),
      editIssue: vi.fn(),
      deleteIssue: vi.fn(),
      doTransition: vi.fn(),
      getTransitions: vi.fn(),
    };
    issueComments = {
      getComments: vi.fn(),
      addComment: vi.fn(),
    };
    issueSearch = {
      searchForIssuesUsingJql: vi.fn(),
    };
    projects = {
      getProject: vi.fn(),
      searchProjects: vi.fn(),
    };
    projectComponents = {
      getProjectComponents: vi.fn(),
    };
    projectVersions = {
      getProjectVersions: vi.fn(),
    };
    userSearch = {
      findUsers: vi.fn(),
    };
  }

  class MockAgileClient {
    board = {
      getAllBoards: vi.fn(),
      getBoard: vi.fn(),
      getAllSprints: vi.fn(),
    };
    sprint = {
      getIssuesForSprint: vi.fn(),
      moveIssuesToSprintAndRank: vi.fn(),
    };
  }

  return {
    Version3Client: MockVersion3Client,
    AgileClient: MockAgileClient,
  };
});

describe('jira-service', () => {
  let service: JiraService;

  const basicAuthConfig: JiraConnectionConfig = {
    host: 'https://test.atlassian.net',
    authMethod: 'basic',
    email: 'test@example.com',
    apiToken: 'test-api-token',
  };

  const oauth2Config: JiraConnectionConfig = {
    host: 'https://test.atlassian.net',
    authMethod: 'oauth2',
    accessToken: 'test-access-token',
  };

  const patConfig: JiraConnectionConfig = {
    host: 'https://test.atlassian.net',
    authMethod: 'pat',
    personalAccessToken: 'test-pat-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = createJiraService();
  });

  afterEach(() => {
    service.disconnect();
  });

  describe('createJiraService', () => {
    it('should create a new JiraService instance', () => {
      const newService = createJiraService();
      expect(newService).toBeInstanceOf(JiraService);
    });
  });

  describe('initialization', () => {
    it('should initialize with basic auth config', async () => {
      await service.initialize(basicAuthConfig);
      expect(service.getConnectionStatus().connected).toBe(false); // Not connected until testConnection
    });

    it('should initialize with oauth2 config', async () => {
      await service.initialize(oauth2Config);
      expect(service.getConnectionStatus().connected).toBe(false);
    });

    it('should initialize with PAT config', async () => {
      await service.initialize(patConfig);
      expect(service.getConnectionStatus().connected).toBe(false);
    });

    it('should initialize with token refresh callback', async () => {
      const refreshCallback = vi.fn().mockResolvedValue('new-token');
      await service.initialize({
        ...oauth2Config,
        tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        onTokenRefresh: refreshCallback,
      });
      expect(service.getConnectionStatus().connected).toBe(false);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return initial disconnected status', () => {
      const status = service.getConnectionStatus();
      expect(status.connected).toBe(false);
    });

    it('should return status with error if not initialized', async () => {
      const status = await service.testConnection();
      expect(status.connected).toBe(false);
      expect(status.error).toBe('Jira client not initialized');
    });
  });

  describe('isConnected', () => {
    it('should return false before initialization', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should return false after initialization but before testConnection', async () => {
      await service.initialize(basicAuthConfig);
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should reset connection status', async () => {
      await service.initialize(basicAuthConfig);
      service.disconnect();
      expect(service.isConnected()).toBe(false);
      expect(service.getConnectionStatus().connected).toBe(false);
    });
  });

  describe('setTokenRefreshCallback', () => {
    it('should accept token refresh callback', async () => {
      await service.initialize(oauth2Config);
      const refreshCallback = vi.fn();
      // Should not throw
      service.setTokenRefreshCallback(refreshCallback, new Date(Date.now() + 3600000).toISOString());
      expect(true).toBe(true);
    });
  });

  describe('updateTokenExpiry', () => {
    it('should update token expiry without error', async () => {
      await service.initialize(oauth2Config);
      const newExpiry = new Date(Date.now() + 7200000).toISOString();
      // Should not throw
      service.updateTokenExpiry(newExpiry);
      expect(true).toBe(true);
    });
  });

  describe('testConnection error handling', () => {
    it('should return error when client not initialized', async () => {
      const newService = createJiraService();
      const status = await newService.testConnection();

      expect(status.connected).toBe(false);
      expect(status.error).toBe('Jira client not initialized');
    });
  });

  describe('getIssue error handling', () => {
    it('should throw error when not initialized', async () => {
      const newService = createJiraService();
      await expect(newService.getIssue('PROJ-1')).rejects.toThrow('Jira client not initialized');
    });
  });

  describe('createIssue error handling', () => {
    it('should throw error when not initialized', async () => {
      const newService = createJiraService();
      await expect(
        newService.createIssue({
          projectKey: 'PROJ',
          summary: 'Test',
          issueTypeId: '10001',
        })
      ).rejects.toThrow('Jira client not initialized');
    });
  });

  describe('updateIssue error handling', () => {
    it('should throw error when not initialized', async () => {
      const newService = createJiraService();
      await expect(newService.updateIssue('PROJ-1', {})).rejects.toThrow(
        'Jira client not initialized'
      );
    });
  });

  describe('deleteIssue error handling', () => {
    it('should throw error when not initialized', async () => {
      const newService = createJiraService();
      await expect(newService.deleteIssue('PROJ-1')).rejects.toThrow('Jira client not initialized');
    });
  });

  describe('searchIssues error handling', () => {
    it('should throw error when not initialized', async () => {
      const newService = createJiraService();
      await expect(newService.searchIssues({ jql: 'project=PROJ' })).rejects.toThrow(
        'Jira client not initialized'
      );
    });
  });

  describe('getProjects error handling', () => {
    it('should throw error when not initialized', async () => {
      const newService = createJiraService();
      await expect(newService.getProjects()).rejects.toThrow('Jira client not initialized');
    });
  });

  describe('getBoards error handling', () => {
    it('should throw error when not initialized', async () => {
      const newService = createJiraService();
      await expect(newService.getBoards()).rejects.toThrow('Agile client not initialized');
    });
  });

  describe('getSprints error handling', () => {
    it('should throw error when not initialized', async () => {
      const newService = createJiraService();
      await expect(newService.getSprints(1)).rejects.toThrow('Agile client not initialized');
    });
  });
});

describe('JiraApiError', () => {
  it('should create error with message only', () => {
    const error = new JiraApiError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('JiraApiError');
    expect(error.statusCode).toBeUndefined();
    expect(error.jiraErrorMessages).toBeUndefined();
  });

  it('should create error with status code', () => {
    const error = new JiraApiError('Not found', 404);
    expect(error.message).toBe('Not found');
    expect(error.statusCode).toBe(404);
  });

  it('should create error with jira error messages', () => {
    const error = new JiraApiError('Validation failed', 400, ['Field is required', 'Invalid value']);
    expect(error.message).toBe('Validation failed');
    expect(error.statusCode).toBe(400);
    expect(error.jiraErrorMessages).toEqual(['Field is required', 'Invalid value']);
  });

  it('should be an instance of Error', () => {
    const error = new JiraApiError('Test');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(JiraApiError);
  });
});
