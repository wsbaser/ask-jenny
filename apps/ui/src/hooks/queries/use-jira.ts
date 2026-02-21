/**
 * Jira Integration Hooks
 *
 * React Query hooks for Jira API operations.
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import type {
  JiraConnectionStatus,
  JiraBoard,
  JiraSprint,
  JiraSprintIssuesResponse,
} from '@automaker/types';

/**
 * Query key factory for Jira
 */
export const jiraKeys = {
  all: ['jira'] as const,
  status: () => [...jiraKeys.all, 'status'] as const,
  boards: () => [...jiraKeys.all, 'boards'] as const,
  sprints: (boardId: number) => [...jiraKeys.all, 'sprints', boardId] as const,
  sprintIssues: (options?: { boardId?: number; sprintId?: number }) =>
    [...jiraKeys.all, 'sprintIssues', options] as const,
};

/**
 * Hook to get Jira connection status
 */
export function useJiraConnectionStatus() {
  const httpClient = getHttpApiClient();

  return useQuery<JiraConnectionStatus>({
    queryKey: jiraKeys.status(),
    queryFn: async () => {
      const response = await httpClient.fetch('/api/jira/status');
      if (!response.ok) {
        throw new Error(`Jira status request error: ${response.status}`);
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    retry: false,
  });
}

/**
 * Hook to get Jira boards
 */
export function useJiraBoards(options?: { enabled?: boolean }) {
  const httpClient = getHttpApiClient();

  return useQuery<{ boards: JiraBoard[] }>({
    queryKey: jiraKeys.boards(),
    queryFn: async () => {
      const response = await httpClient.fetch('/api/jira/boards');
      if (!response.ok) {
        throw new Error(`Jira boards request error: ${response.status}`);
      }
      return response.json();
    },
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

/**
 * Hook to get sprints for a board
 */
export function useJiraSprints(
  boardId: number | undefined,
  options?: { state?: 'active' | 'future' | 'closed'; enabled?: boolean }
) {
  const httpClient = getHttpApiClient();
  const isEnabled = boardId !== undefined && (options?.enabled ?? true);

  return useQuery<{ sprints: JiraSprint[] }>({
    // Query key uses 'undefined' marker when boardId is not set (query won't run)
    queryKey:
      boardId !== undefined
        ? jiraKeys.sprints(boardId)
        : ([...jiraKeys.all, 'sprints', 'disabled'] as const),
    queryFn: async () => {
      // This check is redundant due to enabled, but provides type safety
      if (boardId === undefined) {
        throw new Error('Board ID is required');
      }
      const params = options?.state ? `?state=${options.state}` : '';
      const response = await httpClient.fetch(`/api/jira/boards/${boardId}/sprints${params}`);
      if (!response.ok) {
        throw new Error(`Jira sprints request error: ${response.status}`);
      }
      return response.json();
    },
    enabled: isEnabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to get sprint issues
 */
export function useJiraSprintIssues(
  options: {
    boardId?: number;
    sprintId?: number;
    statusFilter?: 'todo' | 'indeterminate' | 'all';
    maxResults?: number;
    enabled?: boolean;
  } = {}
) {
  const httpClient = getHttpApiClient();
  const { enabled = true, ...requestOptions } = options;

  return useQuery<JiraSprintIssuesResponse>({
    queryKey: jiraKeys.sprintIssues(requestOptions),
    queryFn: async () => {
      const response = await httpClient.fetch('/api/jira/sprint-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestOptions),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Jira sprint issues request error: ${response.status}`);
      }
      return response.json();
    },
    enabled,
    staleTime: 60 * 1000, // 1 minute
  });
}
