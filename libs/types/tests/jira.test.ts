/**
 * Unit tests for Jira types
 *
 * Tests type definitions and default values for Jira integration
 */

import { describe, it, expect } from 'vitest';
import type {
  JiraCredentials,
  JiraConnectionStatus,
  JiraProject,
  JiraBoard,
  JiraSprint,
  JiraIssue,
  JiraImportRequest,
  JiraImportResponse,
  JiraImportResult,
  JiraSprintIssuesResponse,
} from '../src/jira.js';

describe('Jira types', () => {
  describe('JiraCredentials', () => {
    it('should define all required fields', () => {
      const credentials: JiraCredentials = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date().toISOString(),
        cloudId: 'cloud-id',
        siteUrl: 'https://mysite.atlassian.net',
        siteName: 'My Site',
      };

      expect(credentials.accessToken).toBe('access-token');
      expect(credentials.refreshToken).toBe('refresh-token');
      expect(credentials.expiresAt).toBeDefined();
      expect(credentials.cloudId).toBe('cloud-id');
      expect(credentials.siteUrl).toBe('https://mysite.atlassian.net');
      expect(credentials.siteName).toBe('My Site');
    });
  });

  describe('JiraConnectionStatus', () => {
    it('should support not connected state', () => {
      const status: JiraConnectionStatus = {
        configured: true,
        connected: false,
      };

      expect(status.configured).toBe(true);
      expect(status.connected).toBe(false);
      expect(status.siteName).toBeUndefined();
      expect(status.siteUrl).toBeUndefined();
    });

    it('should support connected state', () => {
      const status: JiraConnectionStatus = {
        configured: true,
        connected: true,
        siteName: 'My Jira Site',
        siteUrl: 'https://mysite.atlassian.net',
      };

      expect(status.connected).toBe(true);
      expect(status.siteName).toBe('My Jira Site');
      expect(status.siteUrl).toBe('https://mysite.atlassian.net');
    });

    it('should support not configured state', () => {
      const status: JiraConnectionStatus = {
        configured: false,
        connected: false,
      };

      expect(status.configured).toBe(false);
      expect(status.connected).toBe(false);
    });
  });

  describe('JiraProject', () => {
    it('should define all fields', () => {
      const project: JiraProject = {
        id: 'project-id',
        key: 'PROJ',
        name: 'My Project',
        avatarUrl: 'https://example.com/avatar.png',
      };

      expect(project.id).toBe('project-id');
      expect(project.key).toBe('PROJ');
      expect(project.name).toBe('My Project');
      expect(project.avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('should allow optional avatarUrl', () => {
      const project: JiraProject = {
        id: 'project-id',
        key: 'PROJ',
        name: 'My Project',
      };

      expect(project.avatarUrl).toBeUndefined();
    });
  });

  describe('JiraBoard', () => {
    it('should define scrum board', () => {
      const board: JiraBoard = {
        id: 1,
        name: 'Scrum Board',
        type: 'scrum',
        project: {
          id: '100',
          key: 'PROJ',
          name: 'My Project',
        },
      };

      expect(board.id).toBe(1);
      expect(board.name).toBe('Scrum Board');
      expect(board.type).toBe('scrum');
      expect(board.project).toBeDefined();
    });

    it('should define kanban board', () => {
      const board: JiraBoard = {
        id: 2,
        name: 'Kanban Board',
        type: 'kanban',
      };

      expect(board.type).toBe('kanban');
      expect(board.project).toBeUndefined();
    });

    it('should define simple board', () => {
      const board: JiraBoard = {
        id: 3,
        name: 'Simple Board',
        type: 'simple',
      };

      expect(board.type).toBe('simple');
    });
  });

  describe('JiraSprint', () => {
    it('should define active sprint', () => {
      const sprint: JiraSprint = {
        id: 10,
        name: 'Sprint 10',
        state: 'active',
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-01-14T00:00:00.000Z',
        boardId: 1,
      };

      expect(sprint.id).toBe(10);
      expect(sprint.state).toBe('active');
      expect(sprint.startDate).toBeDefined();
      expect(sprint.endDate).toBeDefined();
    });

    it('should define future sprint', () => {
      const sprint: JiraSprint = {
        id: 11,
        name: 'Sprint 11',
        state: 'future',
        boardId: 1,
      };

      expect(sprint.state).toBe('future');
      expect(sprint.startDate).toBeUndefined();
      expect(sprint.endDate).toBeUndefined();
    });

    it('should define closed sprint', () => {
      const sprint: JiraSprint = {
        id: 9,
        name: 'Sprint 9',
        state: 'closed',
        boardId: 1,
        startDate: '2023-12-18T00:00:00.000Z',
        endDate: '2023-12-31T00:00:00.000Z',
      };

      expect(sprint.state).toBe('closed');
    });
  });

  describe('JiraIssue', () => {
    it('should define complete issue', () => {
      const issue: JiraIssue = {
        id: '10001',
        key: 'PROJ-1',
        summary: 'Implement feature X',
        description: 'Detailed description',
        status: {
          id: '1',
          name: 'To Do',
          statusCategory: 'todo',
        },
        priority: {
          id: '2',
          name: 'High',
          iconUrl: 'https://example.com/high.png',
        },
        issueType: {
          id: '10001',
          name: 'Story',
          iconUrl: 'https://example.com/story.png',
          subtask: false,
        },
        assignee: {
          accountId: 'user-1',
          displayName: 'John Doe',
          emailAddress: 'john@example.com',
          avatarUrl: 'https://example.com/avatar.png',
        },
        reporter: {
          accountId: 'user-2',
          displayName: 'Jane Smith',
        },
        storyPoints: 5,
        labels: ['frontend', 'ui'],
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-02T00:00:00.000Z',
        url: 'https://mysite.atlassian.net/browse/PROJ-1',
      };

      expect(issue.id).toBe('10001');
      expect(issue.key).toBe('PROJ-1');
      expect(issue.status.statusCategory).toBe('todo');
      expect(issue.priority?.name).toBe('High');
      expect(issue.issueType.name).toBe('Story');
      expect(issue.assignee?.displayName).toBe('John Doe');
      expect(issue.storyPoints).toBe(5);
      expect(issue.labels).toContain('frontend');
    });

    it('should define minimal issue', () => {
      const issue: JiraIssue = {
        id: '10002',
        key: 'PROJ-2',
        summary: 'Bug fix',
        status: {
          id: '1',
          name: 'Open',
          statusCategory: 'indeterminate',
        },
        issueType: {
          id: '10002',
          name: 'Bug',
          subtask: false,
        },
        labels: [],
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        url: 'https://mysite.atlassian.net/browse/PROJ-2',
      };

      expect(issue.priority).toBeUndefined();
      expect(issue.assignee).toBeUndefined();
      expect(issue.reporter).toBeUndefined();
      expect(issue.storyPoints).toBeUndefined();
      expect(issue.description).toBeUndefined();
    });

    it('should support different status categories', () => {
      const todoIssue: JiraIssue = {
        id: '1',
        key: 'PROJ-1',
        summary: 'Todo',
        status: { id: '1', name: 'To Do', statusCategory: 'todo' },
        issueType: { id: '1', name: 'Task', subtask: false },
        labels: [],
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        url: '',
      };

      const inProgressIssue: JiraIssue = {
        id: '2',
        key: 'PROJ-2',
        summary: 'In Progress',
        status: { id: '2', name: 'In Progress', statusCategory: 'indeterminate' },
        issueType: { id: '1', name: 'Task', subtask: false },
        labels: [],
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        url: '',
      };

      const doneIssue: JiraIssue = {
        id: '3',
        key: 'PROJ-3',
        summary: 'Done',
        status: { id: '3', name: 'Done', statusCategory: 'done' },
        issueType: { id: '1', name: 'Task', subtask: false },
        labels: [],
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        url: '',
      };

      expect(todoIssue.status.statusCategory).toBe('todo');
      expect(inProgressIssue.status.statusCategory).toBe('indeterminate');
      expect(doneIssue.status.statusCategory).toBe('done');
    });
  });

  describe('JiraImportRequest', () => {
    it('should define complete import request', () => {
      const request: JiraImportRequest = {
        projectPath: '/path/to/project',
        issueIds: ['PROJ-1', 'PROJ-2'],
        defaultCategory: 'Sprint Import',
        includeIssueKey: true,
        includeUrl: true,
      };

      expect(request.projectPath).toBe('/path/to/project');
      expect(request.issueIds).toHaveLength(2);
      expect(request.defaultCategory).toBe('Sprint Import');
      expect(request.includeIssueKey).toBe(true);
      expect(request.includeUrl).toBe(true);
    });

    it('should have optional fields', () => {
      const request: JiraImportRequest = {
        projectPath: '/path/to/project',
        issueIds: ['PROJ-1'],
      };

      expect(request.defaultCategory).toBeUndefined();
      expect(request.includeIssueKey).toBeUndefined();
      expect(request.includeUrl).toBeUndefined();
    });
  });

  describe('JiraImportResponse', () => {
    it('should define complete import response', () => {
      const response: JiraImportResponse = {
        total: 3,
        successful: 2,
        failed: 0,
        duplicates: 1,
        results: [
          { issueKey: 'PROJ-1', success: true, featureId: 'feature-1' },
          { issueKey: 'PROJ-2', success: true, featureId: 'feature-2' },
          { issueKey: 'PROJ-3', success: false, duplicate: true },
        ],
      };

      expect(response.total).toBe(3);
      expect(response.successful).toBe(2);
      expect(response.duplicates).toBe(1);
      expect(response.results).toHaveLength(3);
    });
  });

  describe('JiraImportResult', () => {
    it('should define successful result', () => {
      const result: JiraImportResult = {
        issueKey: 'PROJ-1',
        success: true,
        featureId: 'feature-123',
      };

      expect(result.success).toBe(true);
      expect(result.featureId).toBe('feature-123');
      expect(result.duplicate).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should define duplicate result', () => {
      const result: JiraImportResult = {
        issueKey: 'PROJ-2',
        success: false,
        duplicate: true,
      };

      expect(result.success).toBe(false);
      expect(result.duplicate).toBe(true);
    });

    it('should define error result', () => {
      const result: JiraImportResult = {
        issueKey: 'PROJ-3',
        success: false,
        error: 'Failed to create feature',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create feature');
    });
  });

  describe('JiraSprintIssuesResponse', () => {
    it('should define complete response', () => {
      const response: JiraSprintIssuesResponse = {
        sprint: {
          id: 10,
          name: 'Sprint 10',
          state: 'active',
          boardId: 1,
        },
        issues: [
          {
            id: '1',
            key: 'PROJ-1',
            summary: 'Test',
            status: { id: '1', name: 'To Do', statusCategory: 'todo' },
            issueType: { id: '1', name: 'Task', subtask: false },
            labels: [],
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
            url: '',
          },
        ],
        total: 1,
      };

      expect(response.sprint).toBeDefined();
      expect(response.sprint?.name).toBe('Sprint 10');
      expect(response.issues).toHaveLength(1);
      expect(response.total).toBe(1);
    });

    it('should support no sprint scenario', () => {
      const response: JiraSprintIssuesResponse = {
        sprint: undefined,
        issues: [],
        total: 0,
      };

      expect(response.sprint).toBeUndefined();
      expect(response.issues).toHaveLength(0);
    });
  });
});
