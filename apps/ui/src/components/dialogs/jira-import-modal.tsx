/**
 * Jira Import Modal
 *
 * Modal dialog for importing Jira issues as features.
 * Allows users to:
 * - Select a Jira project to import from
 * - Filter issues by sprint (active, future, or all backlog)
 * - Select specific issues to import
 * - Configure import options (include comments, dependencies)
 *
 * @accessibility
 * - Multi-step wizard with progress indicator
 * - Keyboard navigation between steps
 * - Screen reader announcements for step changes
 * - Focus management on step transitions
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  FileText,
  MessageSquare,
  Link2,
  Filter,
  Check,
  FolderOpen,
  ListChecks,
  Loader2,
} from 'lucide-react';
import {
  useJiraProjects,
  useJiraIssues,
  useJiraBoards,
  useJiraSprints,
  useJiraSprintIssues,
  useJiraConnectionStatus,
} from '@/hooks/queries/use-jira';
import type { JiraIssue, JiraProject, JiraSprint } from '@automaker/types';

const logger = createLogger('JiraImportModal');

// API endpoint for Jira import
const JIRA_IMPORT_ENDPOINT = '/api/jira/import' as const;

/**
 * Import options for customizing the import behavior
 */
interface ImportOptions {
  includeComments: boolean;
  includeDependencies: boolean;
  skipDuplicates: boolean;
}

/**
 * Result from the import operation
 */
interface ImportResult {
  imported: Array<{ issueKey: string; featureId: string; title: string }>;
  skipped: Array<{ issueKey: string; reason: string }>;
  failed: Array<{ issueKey: string; error: string }>;
  totalImported: number;
  totalSkipped: number;
  totalFailed: number;
}

interface JiraImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  onImportComplete?: (result: ImportResult) => void;
}

type ImportStep = 'select-project' | 'select-issues' | 'importing' | 'complete';
type IssueSource = 'sprint' | 'backlog' | 'jql';

/**
 * Step configuration for the import wizard
 */
const IMPORT_STEPS = [
  { id: 'select-project', label: 'Select Project', icon: FolderOpen },
  { id: 'select-issues', label: 'Select Issues', icon: ListChecks },
  { id: 'importing', label: 'Import', icon: Download },
  { id: 'complete', label: 'Complete', icon: CheckCircle2 },
] as const;

/**
 * StepIndicator component for visualizing wizard progress
 */
function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: ImportStep;
  steps: typeof IMPORT_STEPS;
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <nav aria-label="Import progress" className="px-4 pt-2 pb-4">
      <ol className="flex items-center justify-between" role="list">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const StepIcon = step.icon;

          return (
            <li key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors',
                    isCompleted && 'bg-primary border-primary text-primary-foreground',
                    isCurrent && 'border-primary text-primary bg-primary/10',
                    !isCompleted && !isCurrent && 'border-muted-foreground/30 text-muted-foreground/50'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <StepIcon className="w-4 h-4" aria-hidden="true" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs mt-1.5 font-medium whitespace-nowrap',
                    isCurrent && 'text-primary',
                    isCompleted && 'text-foreground',
                    !isCompleted && !isCurrent && 'text-muted-foreground/50'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'w-12 h-0.5 mx-2 mt-[-1rem]',
                    index < currentIndex ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function JiraImportModal({
  open,
  onOpenChange,
  projectPath,
  onImportComplete,
}: JiraImportModalProps) {
  // Current step in the import flow
  const [step, setStep] = useState<ImportStep>('select-project');

  // Project selection
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);

  // Issue source selection
  const [issueSource, setIssueSource] = useState<IssueSource>('sprint');
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);

  // Issue selection
  const [selectedIssueKeys, setSelectedIssueKeys] = useState<Set<string>>(new Set());

  // Import options
  const [options, setOptions] = useState<ImportOptions>({
    includeComments: false,
    includeDependencies: false,
    skipDuplicates: true,
  });

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Screen reader announcements
  const [announcement, setAnnouncement] = useState<string>('');

  // Query hooks
  const { data: connectionStatus } = useJiraConnectionStatus();
  const { data: projectsData, isLoading: isLoadingProjects } = useJiraProjects();
  const { data: boardsData, isLoading: isLoadingBoards } = useJiraBoards(selectedProjectKey ?? undefined);

  // Get the first board for the project (for sprint selection)
  const boardId = boardsData?.boards?.[0]?.id;

  const { data: sprintsData, isLoading: isLoadingSprints } = useJiraSprints(
    boardId,
    'active'
  );

  // Fetch issues based on source
  const { data: sprintIssuesData, isLoading: isLoadingSprintIssues } = useJiraSprintIssues(
    issueSource === 'sprint' && selectedSprintId ? selectedSprintId : undefined
  );

  const { data: backlogIssuesData, isLoading: isLoadingBacklogIssues } = useJiraIssues(
    issueSource === 'backlog' && selectedProjectKey ? selectedProjectKey : undefined,
    selectedProjectKey ? `project = "${selectedProjectKey}" ORDER BY created DESC` : undefined
  );

  // Get the list of issues based on the selected source
  const issues = useMemo(() => {
    if (issueSource === 'sprint' && sprintIssuesData) {
      return sprintIssuesData.issues;
    }
    if (issueSource === 'backlog' && backlogIssuesData) {
      return backlogIssuesData.issues;
    }
    return [];
  }, [issueSource, sprintIssuesData, backlogIssuesData]);

  const isLoadingIssues = issueSource === 'sprint' ? isLoadingSprintIssues : isLoadingBacklogIssues;

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep('select-project');
      setSelectedProjectKey(null);
      setSelectedSprintId(null);
      setSelectedIssueKeys(new Set());
      setOptions({
        includeComments: false,
        includeDependencies: false,
        skipDuplicates: true,
      });
      setIsImporting(false);
      setImportError(null);
      setImportResult(null);
      setAnnouncement('');
    }
  }, [open]);

  // Auto-select first active sprint when sprints load
  useEffect(() => {
    if (sprintsData?.sprints && sprintsData.sprints.length > 0 && !selectedSprintId) {
      const activeSprint = sprintsData.sprints.find((s) => s.state === 'active');
      if (activeSprint) {
        setSelectedSprintId(activeSprint.id);
      } else {
        setSelectedSprintId(sprintsData.sprints[0].id);
      }
    }
  }, [sprintsData, selectedSprintId]);

  // Handle project selection and move to next step
  const handleProjectSelect = useCallback((projectKey: string) => {
    setSelectedProjectKey(projectKey);
    setSelectedSprintId(null);
    setSelectedIssueKeys(new Set());
    setStep('select-issues');
    setAnnouncement(`Selected project ${projectKey}. Now select issues to import.`);
  }, []);

  // Toggle issue selection
  const handleIssueToggle = useCallback((issueKey: string) => {
    setSelectedIssueKeys((prev) => {
      const next = new Set(prev);
      if (next.has(issueKey)) {
        next.delete(issueKey);
      } else {
        next.add(issueKey);
      }
      return next;
    });
  }, []);

  // Select/deselect all issues
  const handleSelectAll = useCallback(() => {
    if (selectedIssueKeys.size === issues.length) {
      setSelectedIssueKeys(new Set());
    } else {
      setSelectedIssueKeys(new Set(issues.map((i) => i.key)));
    }
  }, [issues, selectedIssueKeys.size]);

  // Handle import
  const handleImport = useCallback(async () => {
    if (selectedIssueKeys.size === 0) return;

    setIsImporting(true);
    setImportError(null);
    setStep('importing');
    setAnnouncement(`Importing ${selectedIssueKeys.size} issue${selectedIssueKeys.size !== 1 ? 's' : ''}...`);

    try {
      const response = await fetch(JIRA_IMPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectPath,
          issueKeys: Array.from(selectedIssueKeys),
          options: {
            includeComments: options.includeComments,
            includeDependencies: options.includeDependencies,
            skipDuplicates: options.skipDuplicates,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Import failed');
      }

      setImportResult(result);
      setStep('complete');
      setAnnouncement(
        `Import complete! ${result.totalImported} issue${result.totalImported !== 1 ? 's' : ''} imported successfully.` +
        (result.totalSkipped > 0 ? ` ${result.totalSkipped} skipped.` : '') +
        (result.totalFailed > 0 ? ` ${result.totalFailed} failed.` : '')
      );
      onImportComplete?.(result);
    } catch (err) {
      logger.error('Import failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Import failed';
      setImportError(errorMessage);
      setStep('select-issues');
      setAnnouncement(`Import failed: ${errorMessage}. Please try again.`);
    } finally {
      setIsImporting(false);
    }
  }, [selectedIssueKeys, projectPath, options, onImportComplete]);

  // Render project selection step
  const renderProjectSelection = () => {
    const projects = projectsData?.projects ?? [];

    if (isLoadingProjects) {
      return (
        <div
          className="space-y-3 animate-pulse"
          role="status"
          aria-label="Loading projects"
        >
          {/* Skeleton cards */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg border border-border"
            >
              <div className="w-8 h-8 rounded bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-3 w-48 rounded bg-muted" />
              </div>
              <div className="w-4 h-4 rounded bg-muted" />
            </div>
          ))}
          <span className="sr-only">Loading Jira projects...</span>
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <div
          className="flex flex-col items-center justify-center py-12 text-center"
          role="status"
        >
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" aria-hidden="true" />
          <p className="text-foreground font-medium">No Jira projects found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Make sure you have access to at least one Jira project
          </p>
        </div>
      );
    }

    return (
      <ScrollArea className="h-[400px] pr-4">
        <ul className="space-y-2" role="listbox" aria-label="Available Jira projects">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                onClick={() => handleProjectSelect(project.key)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg border border-border',
                  'hover:bg-accent hover:border-accent transition-colors',
                  'text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
                )}
                role="option"
                aria-selected={false}
                aria-label={`${project.name} (${project.key})${project.description ? `: ${project.description}` : ''}`}
              >
                {project.avatarUrl ? (
                  <img
                    src={project.avatarUrl}
                    alt=""
                    className="w-8 h-8 rounded"
                    aria-hidden="true"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center" aria-hidden="true">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{project.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {project.key}
                    </Badge>
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {project.description}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    );
  };

  // Render issue selection step
  const renderIssueSelection = () => {
    const sprints = sprintsData?.sprints ?? [];
    const isLoading = isLoadingBoards || isLoadingSprints || isLoadingIssues;

    return (
      <div className="space-y-4">
        {/* Source and sprint selection */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Select
              value={issueSource}
              onValueChange={(value) => setIssueSource(value as IssueSource)}
            >
              <SelectTrigger className="w-full">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sprint">Active Sprint</SelectItem>
                <SelectItem value="backlog">Backlog</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {issueSource === 'sprint' && sprints.length > 0 && (
            <div className="flex-1">
              <Select
                value={selectedSprintId?.toString() ?? ''}
                onValueChange={(value) => setSelectedSprintId(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select sprint" />
                </SelectTrigger>
                <SelectContent>
                  {sprints.map((sprint) => (
                    <SelectItem key={sprint.id} value={sprint.id.toString()}>
                      {sprint.name}
                      {sprint.state === 'active' && (
                        <Badge variant="default" className="ml-2 text-xs">
                          Active
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Issues list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" />
            <span className="ml-3 text-muted-foreground">Loading issues...</span>
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No issues found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {issueSource === 'sprint'
                ? 'Try selecting a different sprint or use the backlog'
                : 'This project has no issues in the backlog'}
            </p>
          </div>
        ) : (
          <>
            {/* Select all / count */}
            <div className="flex items-center justify-between px-1">
              <button
                onClick={handleSelectAll}
                className="text-sm text-primary hover:underline"
              >
                {selectedIssueKeys.size === issues.length ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-sm text-muted-foreground">
                {selectedIssueKeys.size} of {issues.length} selected
              </span>
            </div>

            <ScrollArea className="h-[280px] pr-4">
              <div className="space-y-2">
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border border-border',
                      'hover:bg-accent/50 transition-colors cursor-pointer',
                      selectedIssueKeys.has(issue.key) && 'bg-accent border-primary/50'
                    )}
                    onClick={() => handleIssueToggle(issue.key)}
                  >
                    <Checkbox
                      checked={selectedIssueKeys.has(issue.key)}
                      onCheckedChange={() => handleIssueToggle(issue.key)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {issue.key}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-xs shrink-0',
                            issue.issueType.name === 'Bug' && 'bg-red-500/10 text-red-500',
                            issue.issueType.name === 'Story' && 'bg-green-500/10 text-green-500',
                            issue.issueType.name === 'Task' && 'bg-blue-500/10 text-blue-500'
                          )}
                        >
                          {issue.issueType.name}
                        </Badge>
                        {issue.priority && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {issue.priority.name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground mt-1 line-clamp-2">
                        {issue.summary}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-xs',
                            issue.status.statusCategory === 'done' &&
                              'bg-green-500/10 text-green-500',
                            issue.status.statusCategory === 'indeterminate' &&
                              'bg-blue-500/10 text-blue-500',
                            issue.status.statusCategory === 'new' &&
                              'bg-gray-500/10 text-gray-500'
                          )}
                        >
                          {issue.status.name}
                        </span>
                        {issue.storyPoints !== undefined && (
                          <span>{issue.storyPoints} pts</span>
                        )}
                        {issue.assignee && (
                          <span>Assignee: {issue.assignee.displayName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {/* Import options */}
        {issues.length > 0 && (
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Import Options</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={options.includeComments}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, includeComments: checked === true }))
                  }
                />
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Include issue comments</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={options.includeDependencies}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, includeDependencies: checked === true }))
                  }
                />
                <Link2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Map linked issues as dependencies</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={options.skipDuplicates}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, skipDuplicates: checked === true }))
                  }
                />
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Skip already imported issues</span>
              </label>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render importing step
  const renderImporting = () => (
    <div
      className="flex flex-col items-center justify-center py-12"
      role="status"
      aria-live="polite"
      aria-label="Importing issues"
    >
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-card border-2 border-primary flex items-center justify-center text-xs font-bold text-primary">
          {selectedIssueKeys.size}
        </div>
      </div>
      <p className="text-foreground font-medium mt-4">Importing issues...</p>
      <p className="text-sm text-muted-foreground mt-1">
        Creating {selectedIssueKeys.size} feature{selectedIssueKeys.size !== 1 ? 's' : ''} from Jira issues
      </p>
      <p className="text-xs text-muted-foreground mt-3">This may take a moment</p>
    </div>
  );

  // Render complete step
  const renderComplete = () => {
    if (!importResult) return null;

    return (
      <div className="space-y-4">
        {/* Summary */}
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-lg',
            importResult.totalImported > 0
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-yellow-500/10 border border-yellow-500/20'
          )}
        >
          {importResult.totalImported > 0 ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-500" />
          )}
          <div>
            <p className="font-medium text-foreground">
              {importResult.totalImported > 0
                ? `Successfully imported ${importResult.totalImported} issue${importResult.totalImported !== 1 ? 's' : ''}`
                : 'No issues were imported'}
            </p>
            {(importResult.totalSkipped > 0 || importResult.totalFailed > 0) && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {importResult.totalSkipped > 0 && `${importResult.totalSkipped} skipped`}
                {importResult.totalSkipped > 0 && importResult.totalFailed > 0 && ', '}
                {importResult.totalFailed > 0 && `${importResult.totalFailed} failed`}
              </p>
            )}
          </div>
        </div>

        {/* Imported issues */}
        {importResult.imported.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-green-500 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Imported ({importResult.imported.length})
            </p>
            <ScrollArea className="h-[120px]">
              <div className="space-y-1">
                {importResult.imported.map((item) => (
                  <div
                    key={item.issueKey}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Badge variant="outline" className="text-xs">
                      {item.issueKey}
                    </Badge>
                    <span className="truncate">{item.title}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Skipped issues */}
        {importResult.skipped.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-yellow-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Skipped ({importResult.skipped.length})
            </p>
            <ScrollArea className="h-[100px]">
              <div className="space-y-1">
                {importResult.skipped.map((item) => (
                  <div
                    key={item.issueKey}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Badge variant="outline" className="text-xs">
                      {item.issueKey}
                    </Badge>
                    <span className="truncate">{item.reason}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Failed issues */}
        {importResult.failed.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-500 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Failed ({importResult.failed.length})
            </p>
            <ScrollArea className="h-[100px]">
              <div className="space-y-1">
                {importResult.failed.map((item) => (
                  <div
                    key={item.issueKey}
                    className="flex items-center gap-2 text-sm text-red-400"
                  >
                    <Badge variant="outline" className="text-xs border-red-500/50">
                      {item.issueKey}
                    </Badge>
                    <span className="truncate">{item.error}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    );
  };

  // Get step title and description
  const getStepContent = () => {
    switch (step) {
      case 'select-project':
        return {
          title: 'Select Jira Project',
          description: 'Choose a project to import issues from',
        };
      case 'select-issues':
        return {
          title: 'Select Issues to Import',
          description: `Importing from ${selectedProjectKey}`,
        };
      case 'importing':
        return {
          title: 'Importing Issues',
          description: 'Please wait while we import your selected issues',
        };
      case 'complete':
        return {
          title: 'Import Complete',
          description: 'Your Jira issues have been processed',
        };
    }
  };

  const { title, description } = getStepContent();

  // Check if Jira is connected
  const isConnected = connectionStatus?.connected ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border max-w-xl max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="jira-import-modal"
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.97 4.35 4.35 4.35V2.65A.65.65 0 0 0 21.35 2h-9.82Z"
                fill="#2684FF"
              />
              <path
                d="M6.77 6.8c0 2.4 1.96 4.35 4.35 4.35h1.78v1.7c0 2.4 1.96 4.35 4.34 4.35V7.45a.65.65 0 0 0-.65-.65H6.77Z"
                fill="url(#jira-import-gradient-1)"
              />
              <path
                d="M2 11.6c0 2.4 1.96 4.35 4.35 4.35h1.78v1.7c0 2.4 1.96 4.35 4.35 4.35v-9.75a.65.65 0 0 0-.65-.65H2Z"
                fill="url(#jira-import-gradient-2)"
              />
              <defs>
                <linearGradient
                  id="jira-import-gradient-1"
                  x1="15.05"
                  y1="6.85"
                  x2="10.17"
                  y2="11.93"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset=".18" stopColor="#0052CC" />
                  <stop offset="1" stopColor="#2684FF" />
                </linearGradient>
                <linearGradient
                  id="jira-import-gradient-2"
                  x1="10.55"
                  y1="11.68"
                  x2="5.44"
                  y2="16.8"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset=".18" stopColor="#0052CC" />
                  <stop offset="1" stopColor="#2684FF" />
                </linearGradient>
              </defs>
            </svg>
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <StepIndicator currentStep={step} steps={IMPORT_STEPS} />

        {/* Screen reader announcements */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {announcement}
        </div>

        {/* Error message */}
        {importError && (
          <div
            className="flex items-start gap-2 p-3 mx-4 rounded-lg bg-red-500/10 border border-red-500/20"
            role="alert"
            aria-live="assertive"
          >
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-500">Import Error</p>
              <p className="text-sm text-red-500/80 mt-0.5">{importError}</p>
            </div>
          </div>
        )}

        {/* Not connected warning */}
        {!isConnected && step === 'select-project' && (
          <div
            className="flex items-start gap-2 p-3 mx-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-yellow-500">
              Please connect to Jira first to import issues
            </p>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto py-4 px-4">
          {step === 'select-project' && renderProjectSelection()}
          {step === 'select-issues' && renderIssueSelection()}
          {step === 'importing' && renderImporting()}
          {step === 'complete' && renderComplete()}
        </div>

        <DialogFooter className="border-t border-border pt-4">
          {step === 'select-project' && (
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              Cancel
            </Button>
          )}

          {step === 'select-issues' && (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep('select-project')}
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedIssueKeys.size === 0 || isImporting}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                {isImporting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Import {selectedIssueKeys.size} Issue{selectedIssueKeys.size !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </>
          )}

          {step === 'complete' && (
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
