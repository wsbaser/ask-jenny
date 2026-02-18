/**
 * Jira Mutation Hooks
 *
 * React Query mutations for Jira operations like validating issues,
 * creating comments, and managing issue transitions.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type {
  JiraIssue,
  JiraComment,
  JiraConnectionConfig,
  ModelId,
} from '@automaker/types';
import { resolveModelString } from '@automaker/model-resolver';

/**
 * Input for validating a Jira issue
 */
interface ValidateJiraIssueInput {
  issue: JiraIssue;
  jiraProjectKey: string;
  model?: ModelId;
  thinkingLevel?: number;
  reasoningEffort?: string;
  comments?: JiraComment[];
}

/**
 * Input for creating a Jira comment
 */
interface CreateJiraCommentInput {
  issueKey: string;
  body: string;
}

/**
 * Input for updating issue status
 */
interface TransitionJiraIssueInput {
  issueKey: string;
  transitionId: string;
  comment?: string;
}

/**
 * Connect to Jira with provided configuration
 *
 * @returns Mutation for connecting to Jira
 *
 * @example
 * ```tsx
 * const connectMutation = useConnectJira();
 * connectMutation.mutate({
 *   host: 'https://mycompany.atlassian.net',
 *   deploymentType: 'cloud',
 *   authMethod: 'basic',
 *   email: 'user@example.com',
 *   apiToken: 'token',
 * });
 * ```
 */
export function useConnectJira() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: JiraConnectionConfig) => {
      const api = getElectronAPI();
      if (!api.jira?.connect) {
        throw new Error('Jira API not available');
      }

      const result = await api.jira.connect(config);

      if (!result.success) {
        throw new Error(result.error || 'Failed to connect to Jira');
      }

      return {
        connected: result.connected,
        userDisplayName: result.userDisplayName,
      };
    },
    onSuccess: (data) => {
      toast.success('Connected to Jira', {
        description: `Signed in as ${data.userDisplayName}`,
      });
      // Invalidate connection status and projects
      queryClient.invalidateQueries({
        queryKey: queryKeys.jira.connectionStatus(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.jira.projects(),
      });
    },
    onError: (error) => {
      toast.error('Failed to connect to Jira', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Disconnect from Jira
 *
 * @returns Mutation for disconnecting from Jira
 */
export function useDisconnectJira() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const api = getElectronAPI();
      if (!api.jira?.disconnect) {
        throw new Error('Jira API not available');
      }

      const result = await api.jira.disconnect();

      if (!result.success) {
        throw new Error(result.error || 'Failed to disconnect from Jira');
      }

      return result;
    },
    onSuccess: () => {
      toast.success('Disconnected from Jira');
      // Invalidate all Jira queries
      queryClient.invalidateQueries({
        queryKey: ['jira'],
      });
    },
    onError: (error) => {
      toast.error('Failed to disconnect from Jira', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Validate a Jira issue with AI
 *
 * This mutation triggers an async validation process. Results are delivered
 * via WebSocket events (jira_issue_validation_complete, jira_issue_validation_error).
 *
 * @param projectPath - Path to the AutoMaker project
 * @returns Mutation for validating Jira issues
 *
 * @example
 * ```tsx
 * const validateMutation = useValidateJiraIssue(projectPath);
 *
 * validateMutation.mutate({
 *   issue,
 *   jiraProjectKey: 'PROJ',
 *   model: 'sonnet',
 *   comments,
 * });
 * ```
 */
export function useValidateJiraIssue(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ValidateJiraIssueInput) => {
      const { issue, jiraProjectKey, model, thinkingLevel, reasoningEffort, comments } = input;

      const api = getElectronAPI();
      if (!api.jira?.validateIssue) {
        throw new Error('Jira validation API not available');
      }

      const validationInput = {
        issueKey: issue.key,
        issueTitle: issue.summary,
        issueBody: issue.description || '',
        issueType: issue.issueType.name,
        issueLabels: issue.labels,
        comments,
        linkedIssues: issue.linkedIssues,
      };

      // Resolve model alias to canonical model identifier
      const resolvedModel = model ? resolveModelString(model) : undefined;

      const result = await api.jira.validateIssue(
        projectPath,
        jiraProjectKey,
        validationInput,
        resolvedModel,
        thinkingLevel,
        reasoningEffort
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to start validation');
      }

      return { issueKey: issue.key };
    },
    onSuccess: (_, variables) => {
      toast.info(`Starting validation for issue ${variables.issue.key}`, {
        description: 'You will be notified when the analysis is complete',
      });
    },
    onError: (error) => {
      toast.error('Failed to validate issue', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    // Note: We don't invalidate queries here because the actual result
    // comes through WebSocket events which handle cache invalidation
  });
}

/**
 * Mark a Jira validation as viewed
 *
 * @param projectPath - Path to the AutoMaker project
 * @returns Mutation for marking validation as viewed
 *
 * @example
 * ```tsx
 * const markViewedMutation = useMarkJiraValidationViewed(projectPath);
 * markViewedMutation.mutate('PROJ-123');
 * ```
 */
export function useMarkJiraValidationViewed(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (issueKey: string) => {
      const api = getElectronAPI();
      if (!api.jira?.markValidationViewed) {
        throw new Error('Mark viewed API not available');
      }

      const result = await api.jira.markValidationViewed(projectPath, issueKey);

      if (!result.success) {
        throw new Error(result.error || 'Failed to mark as viewed');
      }

      return { issueKey };
    },
    onSuccess: () => {
      // Invalidate validations cache to refresh the viewed state
      queryClient.invalidateQueries({
        queryKey: queryKeys.jira.validations(projectPath),
      });
    },
    // Silent mutation - no toast needed for marking as viewed
  });
}

/**
 * Create a comment on a Jira issue
 *
 * @returns Mutation for creating comments
 *
 * @example
 * ```tsx
 * const createCommentMutation = useCreateJiraComment();
 * createCommentMutation.mutate({
 *   issueKey: 'PROJ-123',
 *   body: 'This is a comment',
 * });
 * ```
 */
export function useCreateJiraComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateJiraCommentInput) => {
      const api = getElectronAPI();
      if (!api.jira?.createComment) {
        throw new Error('Jira API not available');
      }

      const result = await api.jira.createComment(input.issueKey, input.body);

      if (!result.success) {
        throw new Error(result.error || 'Failed to create comment');
      }

      return result.comment;
    },
    onSuccess: (_, variables) => {
      toast.success('Comment added');
      // Invalidate comments cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.jira.issueComments(variables.issueKey),
      });
    },
    onError: (error) => {
      toast.error('Failed to add comment', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Transition a Jira issue to a new status
 *
 * @returns Mutation for transitioning issues
 *
 * @example
 * ```tsx
 * const transitionMutation = useTransitionJiraIssue();
 * transitionMutation.mutate({
 *   issueKey: 'PROJ-123',
 *   transitionId: '31', // "In Progress" transition
 *   comment: 'Starting work on this issue',
 * });
 * ```
 */
export function useTransitionJiraIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TransitionJiraIssueInput) => {
      const api = getElectronAPI();
      if (!api.jira?.transitionIssue) {
        throw new Error('Jira API not available');
      }

      const result = await api.jira.transitionIssue(
        input.issueKey,
        input.transitionId,
        input.comment
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to transition issue');
      }

      return { issueKey: input.issueKey };
    },
    onSuccess: (_, variables) => {
      toast.success('Issue status updated');
      // Invalidate issue cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.jira.issue(variables.issueKey),
      });
    },
    onError: (error) => {
      toast.error('Failed to update issue status', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Get available transitions for a Jira issue
 *
 * @returns Mutation for fetching available transitions
 */
export function useGetJiraIssueTransitions() {
  return useMutation({
    mutationFn: async (issueKey: string) => {
      const api = getElectronAPI();
      if (!api.jira?.getIssueTransitions) {
        throw new Error('Jira API not available');
      }

      const result = await api.jira.getIssueTransitions(issueKey);

      if (!result.success) {
        throw new Error(result.error || 'Failed to get transitions');
      }

      return result.transitions ?? [];
    },
  });
}

/**
 * Assign a Jira issue to a user
 *
 * @returns Mutation for assigning issues
 */
export function useAssignJiraIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueKey, accountId }: { issueKey: string; accountId: string | null }) => {
      const api = getElectronAPI();
      if (!api.jira?.assignIssue) {
        throw new Error('Jira API not available');
      }

      const result = await api.jira.assignIssue(issueKey, accountId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to assign issue');
      }

      return { issueKey };
    },
    onSuccess: (_, variables) => {
      toast.success(variables.accountId ? 'Issue assigned' : 'Issue unassigned');
      queryClient.invalidateQueries({
        queryKey: queryKeys.jira.issue(variables.issueKey),
      });
    },
    onError: (error) => {
      toast.error('Failed to assign issue', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Create a feature from a Jira issue
 *
 * @param projectPath - Path to the AutoMaker project
 * @returns Mutation for creating features from Jira issues
 */
export function useCreateFeatureFromJira(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      issue,
      includeComments = true,
      includeDependencies = false,
      enableSync = false,
    }: {
      issue: JiraIssue;
      includeComments?: boolean;
      includeDependencies?: boolean;
      enableSync?: boolean;
    }) => {
      const api = getElectronAPI();
      if (!api.jira?.createFeatureFromIssue) {
        throw new Error('Jira API not available');
      }

      const result = await api.jira.createFeatureFromIssue(projectPath, {
        issue,
        projectPath,
        includeComments,
        includeDependencies,
        enableSync,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create feature');
      }

      return {
        featureId: result.featureId,
        issueKey: issue.key,
      };
    },
    onSuccess: (data) => {
      toast.success('Feature created from Jira issue', {
        description: `Created from ${data.issueKey}`,
      });
      // Invalidate features cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.all(projectPath),
      });
    },
    onError: (error) => {
      toast.error('Failed to create feature', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Get validation status (running validations)
 *
 * @param projectPath - Path to the AutoMaker project
 * @returns Mutation for getting validation status
 */
export function useGetJiraValidationStatus(projectPath: string) {
  return useMutation({
    mutationFn: async () => {
      const api = getElectronAPI();
      if (!api.jira?.getValidationStatus) {
        throw new Error('Jira validation status API not available');
      }

      const result = await api.jira.getValidationStatus(projectPath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to get validation status');
      }

      return result.runningIssues ?? [];
    },
  });
}
