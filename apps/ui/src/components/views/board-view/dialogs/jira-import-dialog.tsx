/**
 * Jira Import Dialog
 *
 * Allows users to connect to Jira and import sprint tasks as features.
 * Implements WCAG 2.1 AA accessibility standards with enhanced UX.
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Loader2,
  ExternalLink,
  Check,
  AlertCircle,
  RefreshCw,
  Unplug,
  CheckCircle2,
  Circle,
  ListTodo,
  Zap,
  Keyboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useJiraConnectionStatus,
  useJiraBoards,
  useJiraSprintIssues,
} from '@/hooks/queries/use-jira';
import {
  useJiraConnect,
  useJiraDisconnect,
  useJiraImport,
  jiraIssueToImportFormat,
} from '@/hooks/mutations/use-jira-mutations';
import type { JiraIssue } from '@automaker/types';

interface JiraImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  categorySuggestions: string[];
}

export function JiraImportDialog({
  open,
  onOpenChange,
  projectPath,
  categorySuggestions,
}: JiraImportDialogProps) {
  // Connection state
  const {
    data: connectionStatus,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useJiraConnectionStatus();
  const connectMutation = useJiraConnect();
  const disconnectMutation = useJiraDisconnect();

  // Board and sprint data
  const {
    data: boardsData,
    isLoading: isLoadingBoards,
    isError: isBoardsError,
    refetch: refetchBoards,
  } = useJiraBoards({
    enabled: open && (connectionStatus?.connected ?? false),
  });
  const [selectedBoardId, setSelectedBoardId] = useState<number | undefined>();

  // Sprint issues
  const {
    data: sprintData,
    isLoading: isLoadingIssues,
    refetch: refetchIssues,
    isError: isIssuesError,
  } = useJiraSprintIssues({
    boardId: selectedBoardId,
    statusFilter: 'todo',
    enabled: !!selectedBoardId && (connectionStatus?.connected ?? false),
  });

  // Import state
  const importMutation = useJiraImport();
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState('Jira Import');
  const [includeIssueKey, setIncludeIssueKey] = useState(true);
  const [includeUrl, setIncludeUrl] = useState(true);

  // Accessibility: Track focused issue index for keyboard navigation
  const [focusedIssueIndex, setFocusedIssueIndex] = useState<number>(-1);
  const issueListRef = useRef<HTMLDivElement>(null);

  // Import progress tracking
  const [importProgress, setImportProgress] = useState<number>(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Disconnect confirmation dialog
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Keyboard shortcut visibility
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);

  // Auto-select first board when boards are loaded
  useEffect(() => {
    if (boardsData?.boards?.length && !selectedBoardId) {
      const scrumBoard = boardsData.boards.find((b) => b.type === 'scrum');
      if (scrumBoard) {
        setSelectedBoardId(scrumBoard.id);
      } else if (boardsData.boards[0]) {
        setSelectedBoardId(boardsData.boards[0].id);
      }
    }
  }, [boardsData?.boards, selectedBoardId]);

  // Reset selection when sprint data changes
  useEffect(() => {
    setSelectedIssues(new Set());
    setFocusedIssueIndex(-1);
  }, [sprintData?.sprint?.id]);

  // Clean up progress interval when dialog closes or component unmounts
  useEffect(() => {
    if (!open) {
      setImportProgress(0);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [open]);

  // Check URL for OAuth callback parameters
  useEffect(() => {
    if (open) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('jiraConnected') === 'true') {
        toast.success('Successfully connected to Jira', {
          description: 'You can now import sprint tasks as features.',
          duration: 4000,
        });
        // Clean up URL
        const url = new URL(window.location.href);
        url.searchParams.delete('jiraConnected');
        window.history.replaceState({}, '', url.toString());
        refetchStatus();
      }
      if (params.get('jiraError')) {
        const errorMessage = params.get('jiraError');
        toast.error('Jira connection failed', {
          description: errorMessage || 'Please try again or check your Jira settings.',
          duration: 6000,
        });
        // Clean up URL
        const url = new URL(window.location.href);
        url.searchParams.delete('jiraError');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [open, refetchStatus]);

  const handleConnect = async () => {
    try {
      const returnUrl = window.location.href;
      const result = await connectMutation.mutateAsync({ returnUrl });
      // Redirect to Jira OAuth
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error('Failed to connect to Jira', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleDisconnect = async () => {
    setShowDisconnectConfirm(false);
    try {
      await disconnectMutation.mutateAsync();
      toast.success('Disconnected from Jira', {
        description: 'You can reconnect anytime.',
      });
      setSelectedBoardId(undefined);
      setSelectedIssues(new Set());
    } catch (error) {
      toast.error('Failed to disconnect', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleDisconnectClick = () => {
    setShowDisconnectConfirm(true);
  };

  const handleToggleIssue = useCallback((issueKey: string) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueKey)) {
        next.delete(issueKey);
      } else {
        next.add(issueKey);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!sprintData?.issues) return;
    if (selectedIssues.size === sprintData.issues.length) {
      setSelectedIssues(new Set());
    } else {
      setSelectedIssues(new Set(sprintData.issues.map((i) => i.key)));
    }
  }, [sprintData?.issues, selectedIssues.size]);

  // Keyboard navigation for issue list (WCAG 2.1 compliance)
  const issues = sprintData?.issues ?? [];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!issues.length) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIssueIndex((prev) => Math.min(prev + 1, issues.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIssueIndex((prev) => Math.max(prev - 1, 0));
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (focusedIssueIndex >= 0 && focusedIssueIndex < issues.length) {
            handleToggleIssue(issues[focusedIssueIndex].key);
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIssueIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedIssueIndex(issues.length - 1);
          break;
        case 'Escape':
          // Clear selection when Escape is pressed
          if (selectedIssues.size > 0) {
            e.preventDefault();
            e.stopPropagation();
            setSelectedIssues(new Set());
            setFocusedIssueIndex(-1);
          }
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleSelectAll();
          }
          break;
        case '?':
          // Toggle keyboard hints
          e.preventDefault();
          setShowKeyboardHints((prev) => !prev);
          break;
      }
    },
    [issues, focusedIssueIndex, handleToggleIssue, handleSelectAll, selectedIssues.size]
  );

  // Scroll focused issue into view
  useEffect(() => {
    if (focusedIssueIndex >= 0 && issueListRef.current) {
      const focusedElement = issueListRef.current.querySelector(
        `[data-issue-index="${focusedIssueIndex}"]`
      );
      focusedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIssueIndex]);

  const handleImport = async () => {
    if (selectedIssues.size === 0 || !sprintData?.issues) {
      toast.error('No issues selected', {
        description: 'Please select at least one issue to import.',
      });
      return;
    }

    const issuesToImport = sprintData.issues
      .filter((i) => selectedIssues.has(i.key))
      .map(jiraIssueToImportFormat);

    // Simulate progress for better UX
    setImportProgress(10);
    progressIntervalRef.current = setInterval(() => {
      setImportProgress((prev) => Math.min(prev + 15, 85));
    }, 200);

    try {
      const result = await importMutation.mutateAsync({
        projectPath,
        issues: issuesToImport,
        defaultCategory: category,
        includeIssueKey,
        includeUrl,
      });

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setImportProgress(100);

      // Show detailed success message
      if (result.successful > 0) {
        toast.success(`Imported ${result.successful} issue${result.successful > 1 ? 's' : ''}`, {
          description: 'Features have been added to your backlog.',
          duration: 4000,
        });
      }
      if (result.duplicates > 0) {
        toast.info(`${result.duplicates} already imported`, {
          description: 'These issues were skipped to avoid duplicates.',
          duration: 4000,
        });
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} failed to import`, {
          description: 'Some issues could not be imported. Please try again.',
          duration: 5000,
        });
      }

      // Clear selection after successful import
      setSelectedIssues(new Set());

      // Close dialog if all succeeded (with longer delay for user feedback)
      if (result.failed === 0) {
        setTimeout(() => {
          onOpenChange(false);
        }, 1200);
      }
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setImportProgress(0);
      toast.error('Import failed', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const isConnected = connectionStatus?.connected ?? false;
  const isLoading = isLoadingStatus || isLoadingBoards || isLoadingIssues;
  const sprint = sprintData?.sprint;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-2xl max-h-[85vh] flex flex-col sm:max-w-[90vw] md:max-w-2xl"
          aria-labelledby="jira-dialog-title"
          aria-describedby="jira-dialog-description"
          aria-roledescription="Import dialog for Jira sprint tasks"
        >
          <DialogHeader>
            <DialogTitle id="jira-dialog-title" className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-500" aria-hidden="true" />
              Import from Jira
            </DialogTitle>
            <DialogDescription id="jira-dialog-description">
              {isConnected
                ? `Connected to ${connectionStatus?.siteName}. Select sprint tasks to import as features.`
                : 'Connect to Jira to import sprint tasks as features.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* Loading State */}
            {isLoadingStatus && (
              <div
                className="space-y-4 animate-pulse"
                role="status"
                aria-label="Loading Jira connection status"
              >
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-10 w-48" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-40 w-full rounded-lg" />
                </div>
                <span className="sr-only">Loading Jira connection status...</span>
              </div>
            )}

            {/* Not Configured State */}
            {!isLoadingStatus && !isConnected && connectionStatus?.configured === false && (
              <div
                className="flex flex-col items-center justify-center py-8 px-4 space-y-6 bg-amber-500/5 rounded-xl border border-dashed border-amber-500/30"
                role="region"
                aria-label="Jira not configured"
              >
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-amber-500" aria-hidden="true" />
                </div>
                <div className="text-center space-y-2 max-w-sm">
                  <h3 className="font-semibold text-lg">Jira Integration Not Configured</h3>
                  <p className="text-sm text-muted-foreground">
                    Set{' '}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                      JIRA_CLIENT_ID
                    </code>{' '}
                    and{' '}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                      JIRA_CLIENT_SECRET
                    </code>{' '}
                    environment variables on the server to enable Jira integration.
                  </p>
                </div>
              </div>
            )}

            {/* Connection Status / Connect Button */}
            {!isLoadingStatus && !isConnected && connectionStatus?.configured !== false && (
              <div
                className="flex flex-col items-center justify-center py-8 px-4 space-y-6 bg-muted/30 rounded-xl border border-dashed border-muted-foreground/30"
                role="region"
                aria-label="Jira connection"
              >
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Zap className="w-8 h-8 text-blue-500" aria-hidden="true" />
                </div>
                <div className="text-center space-y-2 max-w-sm">
                  <h3 className="font-semibold text-lg">Connect to Jira</h3>
                  <p className="text-sm text-muted-foreground">
                    Link your Jira account to import sprint tasks directly into your project
                    backlog.
                  </p>
                </div>
                <Button
                  onClick={handleConnect}
                  disabled={connectMutation.isPending}
                  size="lg"
                  className="gap-2 min-w-[180px] h-11"
                  aria-describedby="connect-hint"
                >
                  {connectMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      Connect to Jira
                    </>
                  )}
                </Button>
                <p id="connect-hint" className="text-xs text-muted-foreground text-center">
                  You&apos;ll be redirected to Jira to authorize access
                </p>
              </div>
            )}

            {!isLoadingStatus && isConnected && (
              <>
                {/* Connection Info & Controls */}
                <div
                  className="flex items-center justify-between p-4 rounded-lg bg-green-500/5 border border-green-500/20"
                  role="status"
                  aria-label="Jira connection status"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-600" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Connected to <strong>{connectionStatus?.siteName}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground">Ready to import sprint tasks</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => refetchIssues()}
                            disabled={isLoading}
                            aria-label="Refresh sprint issues"
                            className="h-10 w-10 min-w-[44px] min-h-[44px]"
                          >
                            <RefreshCw
                              className={cn('w-4 h-4', isLoading && 'animate-spin')}
                              aria-hidden="true"
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh issues</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleDisconnectClick}
                            disabled={disconnectMutation.isPending}
                            aria-label="Disconnect from Jira"
                            className="h-10 w-10 min-w-[44px] min-h-[44px] text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Unplug className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Disconnect from Jira</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Board Selector */}
                {isLoadingBoards ? (
                  <div className="space-y-2" role="status" aria-label="Loading boards">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : isBoardsError ? (
                  <div
                    className="flex flex-col items-center justify-center py-8 space-y-3 bg-destructive/5 rounded-lg border border-destructive/20"
                    role="alert"
                  >
                    <AlertCircle className="w-10 h-10 text-destructive" aria-hidden="true" />
                    <div className="text-center">
                      <p className="font-medium text-destructive">Failed to load boards</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        There was a problem fetching Jira boards. Your session may have expired.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetchBoards()}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </Button>
                  </div>
                ) : boardsData?.boards && boardsData.boards.length > 1 ? (
                  <div className="space-y-2">
                    <Label htmlFor="board-select" className="text-sm font-medium">
                      Jira Board
                    </Label>
                    <Select
                      value={selectedBoardId?.toString()}
                      onValueChange={(v) => setSelectedBoardId(parseInt(v, 10))}
                    >
                      <SelectTrigger id="board-select" className="h-10">
                        <SelectValue placeholder="Select a board" />
                      </SelectTrigger>
                      <SelectContent>
                        {boardsData.boards.map((board) => (
                          <SelectItem key={board.id} value={board.id.toString()}>
                            <span className="flex items-center gap-2">
                              {board.name}
                              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                                {board.type}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {/* Sprint Info */}
                {sprint && (
                  <div
                    className="p-4 rounded-lg bg-primary/5 border border-primary/20"
                    role="region"
                    aria-label="Active sprint information"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ListTodo className="w-5 h-5 text-primary" aria-hidden="true" />
                        <div>
                          <span className="font-medium">{sprint.name}</span>
                          <span
                            className={cn(
                              'ml-2 text-xs px-2 py-0.5 rounded-full font-medium',
                              sprint.state === 'active'
                                ? 'bg-green-500/10 text-green-600'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {sprint.state}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {issues.length} task{issues.length !== 1 ? 's' : ''} in To Do
                      </span>
                    </div>
                  </div>
                )}

                {/* Issues List */}
                {isLoadingIssues ? (
                  <div className="space-y-3" role="status" aria-label="Loading sprint issues">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                    <div className="border rounded-lg divide-y">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded" />
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-5 w-12 rounded" />
                          </div>
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      ))}
                    </div>
                    <span className="sr-only">Loading sprint issues...</span>
                  </div>
                ) : isIssuesError ? (
                  <div
                    className="flex flex-col items-center justify-center py-8 space-y-3 bg-destructive/5 rounded-lg border border-destructive/20"
                    role="alert"
                  >
                    <AlertCircle className="w-10 h-10 text-destructive" aria-hidden="true" />
                    <div className="text-center">
                      <p className="font-medium text-destructive">Failed to load issues</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        There was a problem fetching sprint issues.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetchIssues()}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </Button>
                  </div>
                ) : issues.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center py-10 space-y-3 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/30"
                    role="status"
                  >
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <ListTodo className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium">No tasks to import</p>
                      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                        {sprint
                          ? 'All tasks in the active sprint are either in progress or completed.'
                          : 'No active sprint found for this board. Start a sprint in Jira first.'}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetchIssues()}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Select Issues to Import
                        <span className="ml-2 text-muted-foreground font-normal">
                          ({selectedIssues.size} of {issues.length} selected)
                        </span>
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAll}
                        className="h-8 text-xs"
                        aria-label={
                          selectedIssues.size === issues.length
                            ? 'Deselect all issues'
                            : 'Select all issues'
                        }
                      >
                        {selectedIssues.size === issues.length ? (
                          <>
                            <Circle className="w-3.5 h-3.5 mr-1.5" />
                            Deselect All
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Select All
                          </>
                        )}
                      </Button>
                    </div>
                    <div
                      ref={issueListRef}
                      className="border rounded-lg divide-y max-h-[300px] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                      role="listbox"
                      aria-label="Sprint issues"
                      aria-multiselectable="true"
                      tabIndex={0}
                      onKeyDown={handleKeyDown}
                    >
                      {issues.map((issue, index) => (
                        <IssueRow
                          key={issue.id}
                          issue={issue}
                          index={index}
                          selected={selectedIssues.has(issue.key)}
                          focused={focusedIssueIndex === index}
                          onToggle={() => handleToggleIssue(issue.key)}
                          onFocus={() => setFocusedIssueIndex(index)}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowKeyboardHints((prev) => !prev)}
                        className="text-xs text-muted-foreground flex items-center gap-1.5 hover:text-foreground transition-colors"
                        aria-expanded={showKeyboardHints}
                        aria-controls="keyboard-hints"
                      >
                        <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Keyboard shortcuts</span>
                        <span className="text-[10px] px-1 py-0.5 rounded bg-muted">?</span>
                      </button>
                      {selectedIssues.size > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Press{' '}
                          <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">
                            Esc
                          </kbd>{' '}
                          to clear selection
                        </span>
                      )}
                    </div>
                    {showKeyboardHints && (
                      <div
                        id="keyboard-hints"
                        className="mt-2 p-3 rounded-lg bg-muted/50 border text-xs space-y-1.5"
                        role="region"
                        aria-label="Keyboard shortcuts"
                      >
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                              ↑↓
                            </kbd>
                            <span className="text-muted-foreground">Navigate issues</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                              Space
                            </kbd>
                            <span className="text-muted-foreground">Toggle selection</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                              Ctrl+A
                            </kbd>
                            <span className="text-muted-foreground">Select all</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                              Esc
                            </kbd>
                            <span className="text-muted-foreground">Clear selection</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                              Home
                            </kbd>
                            <span className="text-muted-foreground">First issue</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono">
                              End
                            </kbd>
                            <span className="text-muted-foreground">Last issue</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Import Options */}
                {issues.length > 0 && (
                  <div className="space-y-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="category-input" className="text-sm font-medium">
                        Category for Imported Features
                      </Label>
                      <Input
                        id="category-input"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="e.g., Jira Import, Sprint Tasks"
                        list="category-suggestions"
                        className="h-10"
                      />
                      <datalist id="category-suggestions">
                        {categorySuggestions.map((cat) => (
                          <option key={cat} value={cat} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="include-key"
                          checked={includeIssueKey}
                          onCheckedChange={(checked) => setIncludeIssueKey(!!checked)}
                        />
                        <Label
                          htmlFor="include-key"
                          className="text-sm font-normal cursor-pointer select-none"
                        >
                          Include issue key in title (e.g., PROJ-123)
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="include-url"
                          checked={includeUrl}
                          onCheckedChange={(checked) => setIncludeUrl(!!checked)}
                        />
                        <Label
                          htmlFor="include-url"
                          className="text-sm font-normal cursor-pointer select-none"
                        >
                          Include link to Jira issue
                        </Label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Import Progress */}
                {importMutation.isPending && importProgress > 0 && (
                  <div
                    className="space-y-3 p-4 rounded-lg bg-primary/5 border border-primary/20"
                    role="status"
                    aria-label="Import progress"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" aria-hidden="true" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          Importing {selectedIssues.size} issue
                          {selectedIssues.size !== 1 ? 's' : ''}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Creating features in your backlog...
                        </p>
                      </div>
                      <span className="text-lg font-semibold text-primary">{importProgress}%</span>
                    </div>
                    <Progress
                      value={importProgress}
                      className="h-2"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={importProgress}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 flex-col-reverse sm:flex-row">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={importMutation.isPending}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            {isConnected && issues.length > 0 && (
              <Button
                onClick={handleImport}
                disabled={selectedIssues.size === 0 || importMutation.isPending}
                className="min-w-[140px] min-h-[44px]"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" aria-hidden="true" />
                    Import {selectedIssues.size > 0 ? `${selectedIssues.size} ` : ''}Issue
                    {selectedIssues.size !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <ConfirmDialog
        open={showDisconnectConfirm}
        onOpenChange={setShowDisconnectConfirm}
        onConfirm={handleDisconnect}
        title="Disconnect from Jira?"
        description="This will remove your Jira connection. You'll need to reconnect and authorize again to import issues."
        icon={Unplug}
        iconClassName="text-destructive"
        confirmText="Disconnect"
        confirmVariant="destructive"
      />
    </>
  );
}

interface IssueRowProps {
  issue: JiraIssue;
  index: number;
  selected: boolean;
  focused: boolean;
  onToggle: () => void;
  onFocus: () => void;
}

/**
 * Individual issue row component - memoized for performance
 * since the parent re-renders on selection/focus changes
 */
const IssueRow = memo(function IssueRow({
  issue,
  index,
  selected,
  focused,
  onToggle,
  onFocus,
}: IssueRowProps) {
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={`${issue.key}: ${issue.summary}${issue.issueType ? `, ${issue.issueType.name}` : ''}${selected ? ', selected' : ''}`}
      data-issue-index={index}
      className={cn(
        'flex items-start gap-3 p-4 cursor-pointer transition-all duration-150',
        'hover:bg-accent/50 active:bg-accent',
        'min-h-[56px]', // Ensure minimum touch target
        selected && 'bg-primary/5 hover:bg-primary/10 border-l-2 border-l-primary',
        focused && 'ring-2 ring-inset ring-primary bg-primary/5 outline-none'
      )}
      onClick={onToggle}
      onMouseEnter={onFocus}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 h-5 w-5"
        tabIndex={-1}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {issue.key}
          </span>
          {issue.issueType && (
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded font-medium',
                issue.issueType.name === 'Bug'
                  ? 'bg-red-500/10 text-red-600'
                  : issue.issueType.name === 'Story'
                    ? 'bg-green-500/10 text-green-600'
                    : 'bg-blue-500/10 text-blue-600'
              )}
            >
              {issue.issueType.name}
            </span>
          )}
          {issue.priority && (
            <span className="text-xs text-muted-foreground">{issue.priority.name}</span>
          )}
        </div>
        <p className="text-sm font-medium mt-1 line-clamp-2">{issue.summary}</p>
        {issue.assignee && (
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
            <span
              className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium"
              aria-hidden="true"
            >
              {issue.assignee.displayName.charAt(0).toUpperCase()}
            </span>
            {issue.assignee.displayName}
          </p>
        )}
      </div>
      {issue.storyPoints !== undefined && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary whitespace-nowrap"
                aria-label={`${issue.storyPoints} story points`}
              >
                {issue.storyPoints} SP
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{issue.storyPoints} Story Points</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});

// Display name for debugging
IssueRow.displayName = 'IssueRow';
