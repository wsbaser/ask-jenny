/**
 * Unit tests for Jira query hooks
 *
 * Tests useJiraConnectionStatus, useJiraBoards, useJiraSprints, useJiraSprintIssues
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useJiraConnectionStatus,
  useJiraBoards,
  useJiraSprints,
  useJiraSprintIssues,
  jiraKeys,
} from '../../hooks/queries/use-jira';

// Mock the http-api-client
vi.mock('@/lib/http-api-client', () => ({
  getHttpApiClient: () => ({
    fetch: vi.fn(),
  }),
}));

import { getHttpApiClient } from '@/lib/http-api-client';

describe('Jira query hooks', () => {
  let queryClient: QueryClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    mockFetch = vi.fn();
    vi.mocked(getHttpApiClient).mockReturnValue({ fetch: mockFetch } as any);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  describe('jiraKeys', () => {
    it('should generate correct query keys', () => {
      expect(jiraKeys.all).toEqual(['jira']);
      expect(jiraKeys.status()).toEqual(['jira', 'status']);
      expect(jiraKeys.boards()).toEqual(['jira', 'boards']);
      expect(jiraKeys.sprints(1)).toEqual(['jira', 'sprints', 1]);
      expect(jiraKeys.sprintIssues(1, 10)).toEqual(['jira', 'sprintIssues', 1, 10]);
    });
  });

  describe('useJiraConnectionStatus', () => {
    it('should fetch connection status successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          configured: true,
          connected: true,
          siteName: 'My Jira Site',
          siteUrl: 'https://mysite.atlassian.net',
        }),
      });

      const { result } = renderHook(() => useJiraConnectionStatus(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({
        configured: true,
        connected: true,
        siteName: 'My Jira Site',
        siteUrl: 'https://mysite.atlassian.net',
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/jira/status');
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useJiraConnectionStatus(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toContain('Failed to fetch connection status');
    });

    it('should return not connected status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          configured: true,
          connected: false,
        }),
      });

      const { result } = renderHook(() => useJiraConnectionStatus(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.connected).toBe(false);
    });
  });

  describe('useJiraBoards', () => {
    it('should fetch boards when enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          boards: [
            { id: 1, name: 'Scrum Board', type: 'scrum' },
            { id: 2, name: 'Kanban Board', type: 'kanban' },
          ],
        }),
      });

      const { result } = renderHook(() => useJiraBoards({ enabled: true }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.boards).toHaveLength(2);
      expect(result.current.data?.boards[0].name).toBe('Scrum Board');
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(() => useJiraBoards({ enabled: false }), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const { result } = renderHook(() => useJiraBoards({ enabled: true }), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('Failed to fetch boards');
    });
  });

  describe('useJiraSprints', () => {
    it('should fetch sprints for a board', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          sprints: [
            { id: 10, name: 'Sprint 10', state: 'active', boardId: 1 },
            { id: 11, name: 'Sprint 11', state: 'future', boardId: 1 },
          ],
        }),
      });

      const { result } = renderHook(() => useJiraSprints(1), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.sprints).toHaveLength(2);
      expect(result.current.data?.sprints[0].state).toBe('active');
    });

    it('should not fetch when boardId is undefined', () => {
      const { result } = renderHook(() => useJiraSprints(undefined), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should filter sprints by state', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          sprints: [{ id: 10, name: 'Sprint 10', state: 'active', boardId: 1 }],
        }),
      });

      const { result } = renderHook(() => useJiraSprints(1, { state: 'active' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith('/api/jira/boards/1/sprints?state=active');
    });

    it('should respect enabled option', () => {
      const { result } = renderHook(() => useJiraSprints(1, { enabled: false }), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('useJiraSprintIssues', () => {
    it('should fetch sprint issues', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          sprint: { id: 10, name: 'Sprint 10', state: 'active', boardId: 1 },
          issues: [
            {
              id: '10001',
              key: 'PROJ-1',
              summary: 'Implement feature',
              status: { id: '1', name: 'To Do', statusCategory: 'todo' },
              issueType: { id: '1', name: 'Story', subtask: false },
              labels: [],
              created: '2024-01-01T00:00:00.000Z',
              updated: '2024-01-02T00:00:00.000Z',
              url: 'https://example.atlassian.net/browse/PROJ-1',
            },
          ],
          total: 1,
        }),
      });

      const { result } = renderHook(() => useJiraSprintIssues(1), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.sprint?.name).toBe('Sprint 10');
      expect(result.current.data?.issues).toHaveLength(1);
      expect(result.current.data?.issues[0].key).toBe('PROJ-1');
    });

    it('should not fetch when boardId is undefined', () => {
      const { result } = renderHook(() => useJiraSprintIssues(undefined), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should pass statusFilter to API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sprint: undefined, issues: [], total: 0 }),
      });

      renderHook(() => useJiraSprintIssues(1, { statusFilter: 'todo' }), { wrapper });

      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith('/api/jira/sprint-issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"statusFilter":"todo"'),
        })
      );
    });

    it('should pass sprintId to API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sprint: undefined, issues: [], total: 0 }),
      });

      renderHook(() => useJiraSprintIssues(1, { sprintId: 10 }), { wrapper });

      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith('/api/jira/sprint-issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"sprintId":10'),
        })
      );
    });

    it('should handle no active sprint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          sprint: undefined,
          issues: [],
          total: 0,
        }),
      });

      const { result } = renderHook(() => useJiraSprintIssues(1), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.sprint).toBeUndefined();
      expect(result.current.data?.issues).toEqual([]);
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const { result } = renderHook(() => useJiraSprintIssues(1), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('Failed to fetch sprint issues');
    });
  });
});
