/**
 * Jira Query Hooks
 *
 * React Query hooks for fetching Jira issues, projects, and validations.
 * Follows the same patterns as use-github.ts for consistency.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type {
  JiraIssue,
  JiraProject,
  JiraComment,
  JiraSprint,
  JiraBoard,
  StoredJiraValidation,
  JiraConnectionStatus,
} from '@automaker/types';

/**
 * Result from fetching Jira issues
 */
interface JiraIssuesResult {
  issues: JiraIssue[];
  total: number;
  hasMore: boolean;
}

/**
 * Result from fetching Jira projects
 */
interface JiraProjectsResult {
  projects: JiraProject[];
}

/**
 * Check Jira connection status
 *
 * @returns Query result with connection status
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useJiraConnectionStatus();
 * if (data?.connected) {
 *   console.log(`Connected as ${data.userDisplayName}`);
 * }
 * ```
 */
export function useJiraConnectionStatus() {
  return useQuery({
    queryKey: queryKeys.jira.connectionStatus(),
    queryFn: async (): Promise<JiraConnectionStatus> => {
      const api = getElectronAPI();
      if (!api.jira?.getConnectionStatus) {
        throw new Error('Jira API not available');
      }
      const result = await api.jira.getConnectionStatus();
      if (!result.success) {
        throw new Error(result.error || 'Failed to get connection status');
      }
      return {
        connected: result.connected ?? false,
        userDisplayName: result.userDisplayName,
        userAccountId: result.userAccountId,
        error: result.error,
        lastConnectedAt: result.lastConnectedAt,
      };
    },
    staleTime: STALE_TIMES.JIRA,
  });
}

/**
 * Fetch Jira projects accessible to the authenticated user
 *
 * @returns Query result with projects
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useJiraProjects();
 * const projects = data?.projects ?? [];
 * ```
 */
export function useJiraProjects() {
  return useQuery({
    queryKey: queryKeys.jira.projects(),
    queryFn: async (): Promise<JiraProjectsResult> => {
      const api = getElectronAPI();
      if (!api.jira?.listProjects) {
        throw new Error('Jira API not available');
      }
      const result = await api.jira.listProjects();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch projects');
      }
      return {
        projects: result.projects ?? [],
      };
    },
    staleTime: STALE_TIMES.JIRA,
  });
}

/**
 * Fetch Jira issues for a project
 *
 * @param projectKey - Jira project key (e.g., "PROJ")
 * @param jql - Optional JQL query to filter issues
 * @returns Query result with issues
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useJiraIssues('PROJ');
 * const issues = data?.issues ?? [];
 * ```
 */
export function useJiraIssues(projectKey: string | undefined, jql?: string) {
  return useQuery({
    queryKey: queryKeys.jira.issues(projectKey ?? '', jql),
    queryFn: async (): Promise<JiraIssuesResult> => {
      if (!projectKey) throw new Error('No project key');
      const api = getElectronAPI();
      if (!api.jira?.searchIssues) {
        throw new Error('Jira API not available');
      }
      // Default JQL: get all issues for the project, ordered by updated date
      const searchJql = jql || `project = "${projectKey}" ORDER BY updated DESC`;
      const result = await api.jira.searchIssues({ jql: searchJql });
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch issues');
      }
      return {
        issues: result.issues ?? [],
        total: result.total ?? 0,
        hasMore: result.hasMore ?? false,
      };
    },
    enabled: !!projectKey,
    staleTime: STALE_TIMES.JIRA,
  });
}

/**
 * Fetch a single Jira issue by key
 *
 * @param issueKey - Jira issue key (e.g., "PROJ-123")
 * @returns Query result with issue details
 *
 * @example
 * ```tsx
 * const { data: issue, isLoading } = useJiraIssue('PROJ-123');
 * ```
 */
export function useJiraIssue(issueKey: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jira.issue(issueKey ?? ''),
    queryFn: async (): Promise<JiraIssue> => {
      if (!issueKey) throw new Error('No issue key');
      const api = getElectronAPI();
      if (!api.jira?.getIssue) {
        throw new Error('Jira API not available');
      }
      const result = await api.jira.getIssue(issueKey);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch issue');
      }
      if (!result.issue) {
        throw new Error('Issue not found');
      }
      return result.issue;
    },
    enabled: !!issueKey,
    staleTime: STALE_TIMES.JIRA,
  });
}

/**
 * Fetch comments for a Jira issue with pagination support
 *
 * @param issueKey - Jira issue key (e.g., "PROJ-123")
 * @returns Infinite query result with comments and pagination helpers
 *
 * @example
 * ```tsx
 * const {
 *   data,
 *   isLoading,
 *   isFetchingNextPage,
 *   hasNextPage,
 *   fetchNextPage,
 * } = useJiraIssueComments('PROJ-123');
 *
 * // Get all comments flattened
 * const comments = data?.pages.flatMap(page => page.comments) ?? [];
 * ```
 */
export function useJiraIssueComments(issueKey: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.jira.issueComments(issueKey ?? ''),
    queryFn: async ({ pageParam }: { pageParam: number | undefined }) => {
      if (!issueKey) throw new Error('No issue key');
      const api = getElectronAPI();
      if (!api.jira?.getIssueComments) {
        throw new Error('Jira API not available');
      }
      const result = await api.jira.getIssueComments(issueKey, pageParam);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch comments');
      }
      return {
        comments: (result.comments ?? []) as JiraComment[],
        totalCount: result.totalCount ?? 0,
        hasMore: result.hasMore ?? false,
        startAt: result.startAt ?? 0,
        maxResults: result.maxResults ?? 50,
      };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.startAt + lastPage.maxResults;
    },
    enabled: !!issueKey,
    staleTime: STALE_TIMES.JIRA,
  });
}

/**
 * Fetch Jira validations for a project
 *
 * @param projectPath - Path to the AutoMaker project
 * @param issueKey - Optional issue key to filter by
 * @returns Query result with validations
 *
 * @example
 * ```tsx
 * const { data: validations } = useJiraValidations(projectPath);
 * ```
 */
export function useJiraValidations(projectPath: string | undefined, issueKey?: string) {
  return useQuery({
    queryKey: issueKey
      ? queryKeys.jira.validation(projectPath ?? '', issueKey)
      : queryKeys.jira.validations(projectPath ?? ''),
    queryFn: async (): Promise<StoredJiraValidation[]> => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      if (!api.jira?.getValidations) {
        throw new Error('Jira API not available');
      }
      const result = await api.jira.getValidations(projectPath, issueKey);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch validations');
      }
      return result.validations ?? [];
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.JIRA,
  });
}

/**
 * Fetch Jira boards for a project
 *
 * @param projectKey - Jira project key
 * @returns Query result with boards
 *
 * @example
 * ```tsx
 * const { data } = useJiraBoards('PROJ');
 * const boards = data?.boards ?? [];
 * ```
 */
export function useJiraBoards(projectKey: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jira.boards(projectKey ?? ''),
    queryFn: async (): Promise<{ boards: JiraBoard[] }> => {
      if (!projectKey) throw new Error('No project key');
      const api = getElectronAPI();
      if (!api.jira?.listBoards) {
        throw new Error('Jira API not available');
      }
      const result = await api.jira.listBoards(projectKey);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch boards');
      }
      return {
        boards: result.boards ?? [],
      };
    },
    enabled: !!projectKey,
    staleTime: STALE_TIMES.JIRA,
  });
}

/**
 * Fetch sprints for a Jira board
 *
 * @param boardId - Jira board ID
 * @param state - Optional sprint state filter ('active', 'future', 'closed')
 * @returns Query result with sprints
 *
 * @example
 * ```tsx
 * const { data } = useJiraSprints(boardId, 'active');
 * const activeSprints = data?.sprints ?? [];
 * ```
 */
export function useJiraSprints(boardId: number | undefined, state?: 'active' | 'future' | 'closed') {
  return useQuery({
    queryKey: queryKeys.jira.sprints(boardId ?? 0, state),
    queryFn: async (): Promise<{ sprints: JiraSprint[] }> => {
      if (!boardId) throw new Error('No board ID');
      const api = getElectronAPI();
      if (!api.jira?.listSprints) {
        throw new Error('Jira API not available');
      }
      const result = await api.jira.listSprints(boardId, state);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch sprints');
      }
      return {
        sprints: result.sprints ?? [],
      };
    },
    enabled: !!boardId,
    staleTime: STALE_TIMES.JIRA,
  });
}

/**
 * Fetch issues in a sprint
 *
 * @param sprintId - Jira sprint ID
 * @returns Query result with sprint issues
 *
 * @example
 * ```tsx
 * const { data } = useJiraSprintIssues(sprintId);
 * const issues = data?.issues ?? [];
 * ```
 */
export function useJiraSprintIssues(sprintId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.jira.sprintIssues(sprintId ?? 0),
    queryFn: async (): Promise<JiraIssuesResult> => {
      if (!sprintId) throw new Error('No sprint ID');
      const api = getElectronAPI();
      if (!api.jira?.getSprintIssues) {
        throw new Error('Jira API not available');
      }
      const result = await api.jira.getSprintIssues(sprintId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch sprint issues');
      }
      return {
        issues: result.issues ?? [],
        total: result.total ?? 0,
        hasMore: result.hasMore ?? false,
      };
    },
    enabled: !!sprintId,
    staleTime: STALE_TIMES.JIRA,
  });
}
