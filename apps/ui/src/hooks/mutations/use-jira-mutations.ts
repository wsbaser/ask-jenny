/**
 * Jira Integration Mutations
 *
 * React Query mutations for Jira operations.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { jiraKeys } from '@/hooks/queries/use-jira';
import { queryKeys } from '@/lib/query-keys';
import type { JiraImportResponse, JiraIssue } from '@ask-jenny/types';

/**
 * Hook to initiate Jira OAuth connection
 */
export function useJiraConnect() {
  const queryClient = useQueryClient();
  const httpClient = getHttpApiClient();

  return useMutation<{ authorizationUrl: string; state: string }, Error, { returnUrl?: string }>({
    mutationFn: async ({ returnUrl }) => {
      const response = await httpClient.fetch('/api/jira/connect', {
        method: 'POST',
        body: JSON.stringify({ returnUrl }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || error.message || 'Failed to connect to Jira');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate status after successful connection initiation
      queryClient.invalidateQueries({ queryKey: jiraKeys.status() });
    },
  });
}

/**
 * Hook to disconnect from Jira
 */
export function useJiraDisconnect() {
  const queryClient = useQueryClient();
  const httpClient = getHttpApiClient();

  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: async () => {
      const response = await httpClient.fetch('/api/jira/disconnect', {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || 'Failed to disconnect from Jira');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all Jira queries
      queryClient.invalidateQueries({ queryKey: jiraKeys.all });
    },
  });
}

/**
 * Subtask details for import
 */
export interface SubtaskForImport {
  key: string;
  summary: string;
  description?: string;
  url?: string;
  status?: string;
}

/**
 * Issue data for import (frontend sends details to avoid re-fetching)
 */
export interface IssueForImport {
  key: string;
  summary: string;
  description?: string;
  url?: string;
  priority?: string;
  issueType?: string;
  storyPoints?: number;
  /** Full subtask details (if this is a parent issue with subtasks) */
  subtasks?: SubtaskForImport[];
  /** Parent key (only present for standalone subtasks) */
  parentKey?: string;
}

/**
 * Import request parameters
 */
export interface ImportRequest {
  projectPath: string;
  issues: IssueForImport[];
  defaultCategory?: string;
  includeIssueKey?: boolean;
  includeUrl?: boolean;
  /** Map of parent issue key -> selected subtask keys */
  subtaskSelections?: Record<string, string[]>;
}

/**
 * Hook to import Jira issues as features
 */
export function useJiraImport() {
  const queryClient = useQueryClient();
  const httpClient = getHttpApiClient();

  return useMutation<JiraImportResponse, Error, ImportRequest>({
    mutationFn: async ({
      projectPath,
      issues,
      defaultCategory,
      includeIssueKey,
      includeUrl,
      subtaskSelections,
    }) => {
      const response = await httpClient.fetch('/api/jira/import', {
        method: 'POST',
        body: JSON.stringify({
          projectPath,
          issueIds: issues.map((i) => i.key),
          issues,
          defaultCategory,
          includeIssueKey,
          includeUrl,
          subtaskSelections,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || 'Failed to import issues');
      }
      return response.json();
    },
    onSuccess: (_, { projectPath }) => {
      // Invalidate features query to show newly imported features
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.all(projectPath),
      });
    },
  });
}

/**
 * Helper to convert JiraIssue to IssueForImport format
 * @param issue - The Jira issue to convert
 * @param subtasks - Optional full subtask details for parent issues
 */
export function jiraIssueToImportFormat(
  issue: JiraIssue,
  subtasks?: SubtaskForImport[]
): IssueForImport {
  return {
    key: issue.key,
    summary: issue.summary,
    description: issue.description,
    url: issue.url,
    priority: issue.priority?.name,
    issueType: issue.issueType?.name,
    storyPoints: issue.storyPoints,
    ...(subtasks && { subtasks }),
  };
}
