/**
 * useJiraSelection
 *
 * Custom hook for managing Jira issue/subtask selection state.
 * Handles parent-child relationships, feature counting, and expand/collapse state.
 */

import { useState, useCallback, useMemo } from 'react';
import type { JiraIssue } from '@ask-jenny/types';

interface SelectionState {
  selectedIssues: Set<string>;
  selectedSubtasks: Set<string>;
  expandedIssues: Set<string>;
}

interface UseJiraSelectionOptions {
  issues: JiraIssue[];
}

interface UseJiraSelectionReturn {
  // State
  selectedIssues: Set<string>;
  selectedSubtasks: Set<string>;
  expandedIssues: Set<string>;
  featureCount: number;

  // Actions
  toggleIssue: (issueKey: string) => void;
  toggleParent: (issue: JiraIssue) => void;
  toggleSubtask: (subtaskKey: string) => void;
  toggleExpand: (issueKey: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Helpers
  hasSubtasks: (issue: JiraIssue) => boolean;
  isParentChecked: (issue: JiraIssue) => boolean;
}

/**
 * Check if an issue has subtasks
 */
function hasSubtasks(issue: JiraIssue): boolean {
  return 'subtasks' in issue && Array.isArray(issue.subtasks) && issue.subtasks.length > 0;
}

/**
 * Calculate the number of features to be created
 * Parent + all subtasks = 1 feature, N partial subtasks = N features
 */
function calculateFeatureCount(
  issues: JiraIssue[],
  selectedIssues: Set<string>,
  selectedSubtasks: Set<string>
): number {
  let count = selectedIssues.size; // Regular issues without subtasks

  // Count parent+subtask combinations
  const parentIssues = issues.filter(hasSubtasks);

  for (const parent of parentIssues) {
    const subtaskKeys = parent.subtasks!.map((s) => s.key);
    const selectedSubtaskKeys = subtaskKeys.filter((key) => selectedSubtasks.has(key));

    if (selectedSubtaskKeys.length === 0) continue;

    // All subtasks selected = 1 combined feature
    if (selectedSubtaskKeys.length === subtaskKeys.length) {
      count += 1;
    } else {
      // Partial subtasks = N separate features
      count += selectedSubtaskKeys.length;
    }
  }

  return count;
}

/**
 * Hook for managing Jira issue selection state
 */
export function useJiraSelection(options: UseJiraSelectionOptions): UseJiraSelectionReturn {
  const { issues } = options;

  const [state, setState] = useState<SelectionState>({
    selectedIssues: new Set(),
    selectedSubtasks: new Set(),
    expandedIssues: new Set(),
  });

  // Feature count derived from state
  const featureCount = useMemo(
    () => calculateFeatureCount(issues, state.selectedIssues, state.selectedSubtasks),
    [issues, state.selectedIssues, state.selectedSubtasks]
  );

  // Toggle a regular issue (without subtasks)
  const toggleIssue = useCallback((issueKey: string) => {
    setState((prev) => {
      const next = new Set(prev.selectedIssues);
      if (next.has(issueKey)) {
        next.delete(issueKey);
      } else {
        next.add(issueKey);
      }
      return { ...prev, selectedIssues: next };
    });
  }, []);

  // Toggle parent issue - selects/deselects ALL subtasks
  const toggleParent = useCallback((issue: JiraIssue) => {
    if (!hasSubtasks(issue)) return;

    setState((prev) => {
      const allSubtaskKeys = issue.subtasks!.map((s) => s.key);
      const allSelected = allSubtaskKeys.every((key) => prev.selectedSubtasks.has(key));

      const nextSubtasks = new Set(prev.selectedSubtasks);
      if (allSelected) {
        // Deselect all subtasks
        allSubtaskKeys.forEach((key) => nextSubtasks.delete(key));
      } else {
        // Select all subtasks
        allSubtaskKeys.forEach((key) => nextSubtasks.add(key));
      }

      return { ...prev, selectedSubtasks: nextSubtasks };
    });
  }, []);

  // Toggle individual subtask
  const toggleSubtask = useCallback((subtaskKey: string) => {
    setState((prev) => {
      const next = new Set(prev.selectedSubtasks);
      if (next.has(subtaskKey)) {
        next.delete(subtaskKey);
      } else {
        next.add(subtaskKey);
      }
      return { ...prev, selectedSubtasks: next };
    });
  }, []);

  // Toggle expand/collapse for parent issues
  const toggleExpand = useCallback((issueKey: string) => {
    setState((prev) => {
      const next = new Set(prev.expandedIssues);
      if (next.has(issueKey)) {
        next.delete(issueKey);
      } else {
        next.add(issueKey);
      }
      return { ...prev, expandedIssues: next };
    });
  }, []);

  // Select or deselect all issues
  const selectAll = useCallback(() => {
    setState((prev) => {
      const allSelectableCount = issues.filter((i) => !('imported' in i) || !i.imported).length;
      const currentTotal = prev.selectedIssues.size + prev.selectedSubtasks.size;

      if (currentTotal === allSelectableCount) {
        // Deselect all
        return {
          selectedIssues: new Set(),
          selectedSubtasks: new Set(),
          expandedIssues: prev.expandedIssues,
        };
      }

      // Select all
      const newSelectedIssues = new Set<string>();
      const newSelectedSubtasks = new Set<string>();

      for (const issue of issues) {
        if ('imported' in issue && issue.imported) continue;

        if (hasSubtasks(issue)) {
          issue.subtasks!.forEach((s) => newSelectedSubtasks.add(s.key));
        } else {
          newSelectedIssues.add(issue.key);
        }
      }

      return {
        selectedIssues: newSelectedIssues,
        selectedSubtasks: newSelectedSubtasks,
        expandedIssues: prev.expandedIssues,
      };
    });
  }, [issues]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIssues: new Set(),
      selectedSubtasks: new Set(),
    }));
  }, []);

  // Check if parent checkbox should be checked (all subtasks selected)
  const isParentChecked = useCallback(
    (issue: JiraIssue): boolean => {
      if (!hasSubtasks(issue)) return false;
      const allSubtaskKeys = issue.subtasks!.map((s) => s.key);
      return (
        allSubtaskKeys.length > 0 && allSubtaskKeys.every((key) => state.selectedSubtasks.has(key))
      );
    },
    [state.selectedSubtasks]
  );

  return {
    // State
    selectedIssues: state.selectedIssues,
    selectedSubtasks: state.selectedSubtasks,
    expandedIssues: state.expandedIssues,
    featureCount,

    // Actions
    toggleIssue,
    toggleParent,
    toggleSubtask,
    toggleExpand,
    selectAll,
    clearSelection,

    // Helpers
    hasSubtasks,
    isParentChecked,
  };
}
