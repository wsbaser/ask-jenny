/**
 * Jira Task List Component
 *
 * Displays a list of Jira issues with selection support.
 * Used for selecting Jira issues for import, validation, or other operations.
 */

import { memo, useCallback, useMemo } from 'react';
import type { JiraIssue, JiraPriority, JiraStatus } from '@automaker/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ExternalLink,
  Layers,
  ListTodo,
  Milestone,
  Sparkles,
  User,
} from 'lucide-react';

/**
 * Props for the JiraTaskList component
 */
export interface JiraTaskListProps {
  /** List of Jira issues to display */
  issues: JiraIssue[];
  /** Set of selected issue keys */
  selectedKeys: Set<string>;
  /** Callback when an issue selection is toggled */
  onToggleSelection: (issueKey: string) => void;
  /** Callback when select all is toggled */
  onToggleSelectAll?: () => void;
  /** Callback when an issue is clicked (for viewing details) */
  onIssueClick?: (issue: JiraIssue) => void;
  /** Whether the list is loading */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Whether to show the header with select all */
  showHeader?: boolean;
  /** Whether to show priority badges */
  showPriority?: boolean;
  /** Whether to show assignee */
  showAssignee?: boolean;
  /** Whether to show external link icon */
  showExternalLink?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Props for individual JiraTaskListItem
 */
interface JiraTaskListItemProps {
  issue: JiraIssue;
  isSelected: boolean;
  onToggleSelection: () => void;
  onIssueClick?: () => void;
  showPriority?: boolean;
  showAssignee?: boolean;
  showExternalLink?: boolean;
}

/**
 * Get icon component for issue type
 */
function getIssueTypeIcon(issueType: string): typeof Bug {
  const typeLower = issueType.toLowerCase();
  if (typeLower.includes('bug')) return Bug;
  if (typeLower.includes('story')) return Sparkles;
  if (typeLower.includes('epic')) return Layers;
  if (typeLower.includes('subtask') || typeLower.includes('sub-task')) return ListTodo;
  if (typeLower.includes('milestone')) return Milestone;
  return CircleDot;
}

/**
 * Get badge variant for status
 */
function getStatusBadgeVariant(
  status: JiraStatus
): 'success' | 'info' | 'warning' | 'muted' {
  const category = status.statusCategory;
  if (category === 'done') return 'success';
  if (category === 'indeterminate') return 'info';
  if (category === 'new') return 'muted';
  // Default based on name patterns
  const nameLower = status.name.toLowerCase();
  if (nameLower.includes('done') || nameLower.includes('complete') || nameLower.includes('resolved')) {
    return 'success';
  }
  if (nameLower.includes('progress') || nameLower.includes('review')) {
    return 'info';
  }
  if (nameLower.includes('blocked') || nameLower.includes('hold')) {
    return 'warning';
  }
  return 'muted';
}

/**
 * Get priority display info
 */
function getPriorityInfo(priority?: JiraPriority): {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
} | null {
  if (!priority) return null;

  const nameLower = priority.name.toLowerCase();
  if (nameLower.includes('highest') || nameLower.includes('blocker') || nameLower.includes('critical')) {
    return {
      label: 'H',
      colorClass: 'text-[var(--status-error)]',
      bgClass: 'bg-[var(--status-error-bg)]',
      borderClass: 'border-[var(--status-error)]/40',
    };
  }
  if (nameLower.includes('high') || nameLower.includes('major')) {
    return {
      label: 'H',
      colorClass: 'text-[var(--status-error)]',
      bgClass: 'bg-[var(--status-error-bg)]',
      borderClass: 'border-[var(--status-error)]/40',
    };
  }
  if (nameLower.includes('medium') || nameLower.includes('normal')) {
    return {
      label: 'M',
      colorClass: 'text-[var(--status-warning)]',
      bgClass: 'bg-[var(--status-warning-bg)]',
      borderClass: 'border-[var(--status-warning)]/40',
    };
  }
  if (nameLower.includes('low') || nameLower.includes('minor') || nameLower.includes('trivial')) {
    return {
      label: 'L',
      colorClass: 'text-[var(--status-info)]',
      bgClass: 'bg-[var(--status-info-bg)]',
      borderClass: 'border-[var(--status-info)]/40',
    };
  }
  // Default to medium
  return {
    label: 'M',
    colorClass: 'text-[var(--status-warning)]',
    bgClass: 'bg-[var(--status-warning-bg)]',
    borderClass: 'border-[var(--status-warning)]/40',
  };
}

/**
 * JiraTaskListItem - Individual row for a Jira issue
 */
const JiraTaskListItem = memo(function JiraTaskListItem({
  issue,
  isSelected,
  onToggleSelection,
  onIssueClick,
  showPriority = true,
  showAssignee = true,
  showExternalLink = true,
}: JiraTaskListItemProps) {
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't trigger row click if clicking on checkbox or external link
      if ((e.target as HTMLElement).closest('button[role="checkbox"]')) {
        return;
      }
      if ((e.target as HTMLElement).closest('a')) {
        return;
      }
      onIssueClick?.();
    },
    [onIssueClick]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onIssueClick?.();
      }
    },
    [onIssueClick]
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    []
  );

  const IssueTypeIcon = getIssueTypeIcon(issue.issueType.name);
  const statusVariant = getStatusBadgeVariant(issue.status);
  const priorityInfo = showPriority ? getPriorityInfo(issue.priority) : null;

  return (
    <div
      role="row"
      tabIndex={onIssueClick ? 0 : undefined}
      onClick={handleRowClick}
      onKeyDown={onIssueClick ? handleKeyDown : undefined}
      className={cn(
        'group flex items-center gap-3 p-3 border-b border-border/50',
        'transition-colors duration-200',
        onIssueClick && 'cursor-pointer',
        'hover:bg-accent/50',
        isSelected && 'bg-accent/70 border-primary/30'
      )}
      data-testid={`jira-task-item-${issue.key}`}
    >
      {/* Checkbox */}
      <div
        className="flex items-center justify-center shrink-0"
        onClick={handleCheckboxClick}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          aria-label={`Select ${issue.key}`}
          data-testid={`jira-task-checkbox-${issue.key}`}
        />
      </div>

      {/* Issue Type Icon */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center justify-center w-6 h-6 rounded shrink-0',
                'bg-muted/50 text-muted-foreground'
              )}
            >
              <IssueTypeIcon className="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{issue.issueType.name}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Issue Key */}
      <span
        className="text-xs font-mono text-muted-foreground shrink-0 w-24"
        title={issue.key}
      >
        {issue.key}
      </span>

      {/* Summary / Title */}
      <div className="flex-1 min-w-0">
        <span
          className="font-medium truncate block"
          title={issue.summary}
        >
          {issue.summary}
        </span>
      </div>

      {/* Status Badge */}
      <Badge
        variant={statusVariant}
        size="sm"
        className="shrink-0"
      >
        {issue.status.name}
      </Badge>

      {/* Priority */}
      {priorityInfo && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'inline-flex items-center justify-center w-6 h-6 rounded-md border-[1.5px] font-bold text-xs shrink-0',
                  priorityInfo.bgClass,
                  priorityInfo.borderClass,
                  priorityInfo.colorClass
                )}
              >
                {priorityInfo.label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{issue.priority?.name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Assignee */}
      {showAssignee && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full shrink-0',
                  issue.assignee
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted/50 text-muted-foreground'
                )}
              >
                {issue.assignee?.avatarUrl ? (
                  <img
                    src={issue.assignee.avatarUrl}
                    alt={issue.assignee.displayName}
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <User className="w-4 h-4" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{issue.assignee?.displayName || 'Unassigned'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* External Link & Chevron */}
      <div className="flex items-center gap-1 shrink-0">
        {showExternalLink && (
          <a
            href={issue.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent',
              'opacity-0 group-hover:opacity-100 transition-opacity'
            )}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Open ${issue.key} in Jira`}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        {onIssueClick && (
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
});

/**
 * JiraTaskListHeader - Header row with select all checkbox
 */
const JiraTaskListHeader = memo(function JiraTaskListHeader({
  totalCount,
  selectedCount,
  onToggleSelectAll,
  showPriority,
  showAssignee,
}: {
  totalCount: number;
  selectedCount: number;
  onToggleSelectAll?: () => void;
  showPriority?: boolean;
  showAssignee?: boolean;
}) {
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const someSelected = selectedCount > 0 && selectedCount < totalCount;

  return (
    <div
      role="row"
      className={cn(
        'flex items-center gap-3 p-3 border-b border-border bg-muted/30',
        'sticky top-0 z-10 backdrop-blur-sm'
      )}
      data-testid="jira-task-list-header"
    >
      {/* Select All Checkbox */}
      <div className="flex items-center justify-center shrink-0">
        <Checkbox
          checked={allSelected}
          // Handle indeterminate state
          data-state={someSelected ? 'indeterminate' : allSelected ? 'checked' : 'unchecked'}
          onCheckedChange={onToggleSelectAll ? () => onToggleSelectAll() : undefined}
          aria-label={allSelected ? 'Deselect all issues' : 'Select all issues'}
          data-testid="jira-task-select-all"
        />
      </div>

      {/* Type column placeholder */}
      <div className="w-6 shrink-0" />

      {/* Key column header */}
      <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">
        Key
      </span>

      {/* Summary column header */}
      <span className="flex-1 text-xs font-medium text-muted-foreground min-w-0">
        Summary
      </span>

      {/* Status column header */}
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-24 text-center">
        Status
      </span>

      {/* Priority column header */}
      {showPriority && (
        <span className="text-xs font-medium text-muted-foreground shrink-0 w-6 text-center">
          P
        </span>
      )}

      {/* Assignee column header */}
      {showAssignee && (
        <span className="text-xs font-medium text-muted-foreground shrink-0 w-6 text-center">
          <User className="w-3 h-3 mx-auto" />
        </span>
      )}

      {/* Actions column placeholder */}
      <div className="w-12 shrink-0" />
    </div>
  );
});

/**
 * JiraTaskList Component
 *
 * Displays a list of Jira issues with selection support.
 * Supports individual and bulk selection with visual feedback.
 *
 * @example
 * ```tsx
 * const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
 *
 * const handleToggle = (key: string) => {
 *   setSelectedKeys(prev => {
 *     const next = new Set(prev);
 *     if (next.has(key)) {
 *       next.delete(key);
 *     } else {
 *       next.add(key);
 *     }
 *     return next;
 *   });
 * };
 *
 * <JiraTaskList
 *   issues={issues}
 *   selectedKeys={selectedKeys}
 *   onToggleSelection={handleToggle}
 *   onToggleSelectAll={() => {
 *     if (selectedKeys.size === issues.length) {
 *       setSelectedKeys(new Set());
 *     } else {
 *       setSelectedKeys(new Set(issues.map(i => i.key)));
 *     }
 *   }}
 * />
 * ```
 */
export const JiraTaskList = memo(function JiraTaskList({
  issues,
  selectedKeys,
  onToggleSelection,
  onToggleSelectAll,
  onIssueClick,
  isLoading = false,
  emptyMessage = 'No issues found',
  showHeader = true,
  showPriority = true,
  showAssignee = true,
  showExternalLink = true,
  className,
}: JiraTaskListProps) {
  // Memoize selection state
  const selectionState = useMemo(() => ({
    selectedCount: selectedKeys.size,
    totalCount: issues.length,
  }), [selectedKeys.size, issues.length]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-muted-foreground',
          className
        )}
        data-testid="jira-task-list-loading"
      >
        <Spinner size="lg" />
        <p className="mt-3 text-sm">Loading issues...</p>
      </div>
    );
  }

  // Empty state
  if (issues.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-muted-foreground',
          className
        )}
        data-testid="jira-task-list-empty"
      >
        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      role="grid"
      aria-label="Jira issues list"
      className={cn('flex flex-col border border-border rounded-lg overflow-hidden', className)}
      data-testid="jira-task-list"
    >
      {/* Header */}
      {showHeader && (
        <JiraTaskListHeader
          totalCount={selectionState.totalCount}
          selectedCount={selectionState.selectedCount}
          onToggleSelectAll={onToggleSelectAll}
          showPriority={showPriority}
          showAssignee={showAssignee}
        />
      )}

      {/* Issue list */}
      <div className="flex flex-col overflow-y-auto">
        {issues.map((issue) => (
          <JiraTaskListItem
            key={issue.key}
            issue={issue}
            isSelected={selectedKeys.has(issue.key)}
            onToggleSelection={() => onToggleSelection(issue.key)}
            onIssueClick={onIssueClick ? () => onIssueClick(issue) : undefined}
            showPriority={showPriority}
            showAssignee={showAssignee}
            showExternalLink={showExternalLink}
          />
        ))}
      </div>

      {/* Selection summary footer */}
      {selectionState.selectedCount > 0 && (
        <div
          className={cn(
            'flex items-center justify-between px-4 py-2',
            'bg-accent/50 border-t border-border',
            'text-sm text-muted-foreground'
          )}
          data-testid="jira-task-list-footer"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span>
              {selectionState.selectedCount} of {selectionState.totalCount} issue
              {selectionState.totalCount !== 1 ? 's' : ''} selected
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

export default JiraTaskList;
