import { useEffect, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import type { AutoModeEvent } from '@/types/electron';

const logger = createLogger('AutoMode');

const AUTO_MODE_SESSION_KEY = 'automaker:autoModeRunningByProjectPath';

function readAutoModeSession(): Record<string, boolean> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.sessionStorage?.getItem(AUTO_MODE_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeAutoModeSession(next: Record<string, boolean>): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage?.setItem(AUTO_MODE_SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors (private mode, disabled storage, etc.)
  }
}

function setAutoModeSessionForProjectPath(projectPath: string, running: boolean): void {
  const current = readAutoModeSession();
  const next = { ...current, [projectPath]: running };
  writeAutoModeSession(next);
}

// Type guard for plan_approval_required event
function isPlanApprovalEvent(
  event: AutoModeEvent
): event is Extract<AutoModeEvent, { type: 'plan_approval_required' }> {
  return event.type === 'plan_approval_required';
}

/**
 * Hook for managing auto mode (scoped per project)
 */
export function useAutoMode() {
  const {
    autoModeByProject,
    setAutoModeRunning,
    addRunningTask,
    removeRunningTask,
    currentProject,
    addAutoModeActivity,
    maxConcurrency,
    projects,
    setPendingPlanApproval,
  } = useAppStore(
    useShallow((state) => ({
      autoModeByProject: state.autoModeByProject,
      setAutoModeRunning: state.setAutoModeRunning,
      addRunningTask: state.addRunningTask,
      removeRunningTask: state.removeRunningTask,
      currentProject: state.currentProject,
      addAutoModeActivity: state.addAutoModeActivity,
      maxConcurrency: state.maxConcurrency,
      projects: state.projects,
      setPendingPlanApproval: state.setPendingPlanApproval,
    }))
  );

  // Helper to look up project ID from path
  const getProjectIdFromPath = useCallback(
    (path: string): string | undefined => {
      const project = projects.find((p) => p.path === path);
      return project?.id;
    },
    [projects]
  );

  // Get project-specific auto mode state
  const projectId = currentProject?.id;
  const projectAutoModeState = useMemo(() => {
    if (!projectId) return { isRunning: false, runningTasks: [] };
    return autoModeByProject[projectId] || { isRunning: false, runningTasks: [] };
  }, [autoModeByProject, projectId]);

  const isAutoModeRunning = projectAutoModeState.isRunning;
  const runningAutoTasks = projectAutoModeState.runningTasks;

  // Check if we can start a new task based on concurrency limit
  const canStartNewTask = runningAutoTasks.length < maxConcurrency;

  // On mount, query backend for current auto loop status and sync UI state.
  // This handles cases where the backend is still running after a page refresh.
  useEffect(() => {
    if (!currentProject) return;

    const syncWithBackend = async () => {
      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.status) return;

        const result = await api.autoMode.status(currentProject.path);
        if (result.success && result.isAutoLoopRunning !== undefined) {
          const backendIsRunning = result.isAutoLoopRunning;
          if (backendIsRunning !== isAutoModeRunning) {
            logger.info(
              `[AutoMode] Syncing UI state with backend for ${currentProject.path}: ${backendIsRunning ? 'ON' : 'OFF'}`
            );
            setAutoModeRunning(currentProject.id, backendIsRunning);
            setAutoModeSessionForProjectPath(currentProject.path, backendIsRunning);
          }
        }
      } catch (error) {
        logger.error('Error syncing auto mode state with backend:', error);
      }
    };

    syncWithBackend();
  }, [currentProject, isAutoModeRunning, setAutoModeRunning]);

  // Handle auto mode events - listen globally for all projects
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      logger.info('Event:', event);

      // Events include projectPath from backend - use it to look up project ID
      // Fall back to current projectId if not provided in event
      let eventProjectId: string | undefined;
      if ('projectPath' in event && event.projectPath) {
        eventProjectId = getProjectIdFromPath(event.projectPath);
      }
      if (!eventProjectId && 'projectId' in event && event.projectId) {
        eventProjectId = event.projectId;
      }
      if (!eventProjectId) {
        eventProjectId = projectId;
      }

      // Skip event if we couldn't determine the project
      if (!eventProjectId) {
        logger.warn('Could not determine project for event:', event);
        return;
      }

      switch (event.type) {
        case 'auto_mode_started':
          // Backend started auto loop - update UI state
          logger.info('[AutoMode] Backend started auto loop for project');
          if (eventProjectId) {
            setAutoModeRunning(eventProjectId, true);
          }
          break;

        case 'auto_mode_stopped':
          // Backend stopped auto loop - update UI state
          logger.info('[AutoMode] Backend stopped auto loop for project');
          if (eventProjectId) {
            setAutoModeRunning(eventProjectId, false);
          }
          break;

        case 'auto_mode_feature_start':
          if (event.featureId) {
            addRunningTask(eventProjectId, event.featureId);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'start',
              message: `Started working on feature`,
            });
          }
          break;

        case 'auto_mode_feature_complete':
          // Feature completed - remove from running tasks and UI will reload features on its own
          if (event.featureId) {
            logger.info('Feature completed:', event.featureId, 'passes:', event.passes);
            removeRunningTask(eventProjectId, event.featureId);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'complete',
              message: event.passes
                ? 'Feature completed successfully'
                : 'Feature completed with failures',
              passes: event.passes,
            });
          }
          break;

        case 'auto_mode_error':
          if (event.featureId && event.error) {
            // Check if this is a user-initiated cancellation or abort (not a real error)
            if (event.errorType === 'cancellation' || event.errorType === 'abort') {
              // User cancelled/aborted the feature - just log as info, not an error
              logger.info('Feature cancelled/aborted:', event.error);
              // Remove from running tasks
              if (eventProjectId) {
                removeRunningTask(eventProjectId, event.featureId);
              }
              break;
            }

            // Real error - log and show to user
            logger.error('Error:', event.error);

            // Check for authentication errors and provide a more helpful message
            const isAuthError =
              event.errorType === 'authentication' ||
              event.error.includes('Authentication failed') ||
              event.error.includes('Invalid API key');

            const errorMessage = isAuthError
              ? `Authentication failed: Please check your API key in Settings or run 'claude login' in terminal to re-authenticate.`
              : event.error;

            addAutoModeActivity({
              featureId: event.featureId,
              type: 'error',
              message: errorMessage,
              errorType: isAuthError ? 'authentication' : 'execution',
            });

            // Remove the task from running since it failed
            if (eventProjectId) {
              removeRunningTask(eventProjectId, event.featureId);
            }
          }
          break;

        case 'auto_mode_progress':
          // Log progress updates (throttle to avoid spam)
          if (event.featureId && event.content && event.content.length > 10) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'progress',
              message: event.content.substring(0, 200), // Limit message length
            });
          }
          break;

        case 'auto_mode_tool':
          // Log tool usage
          if (event.featureId && event.tool) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'tool',
              message: `Using tool: ${event.tool}`,
              tool: event.tool,
            });
          }
          break;

        case 'auto_mode_phase':
          // Log phase transitions (Planning, Action, Verification)
          if (event.featureId && event.phase && event.message) {
            logger.debug(`[AutoMode] Phase: ${event.phase} for ${event.featureId}`);
            addAutoModeActivity({
              featureId: event.featureId,
              type: event.phase,
              message: event.message,
              phase: event.phase,
            });
          }
          break;

        case 'plan_approval_required':
          // Plan requires user approval before proceeding
          if (isPlanApprovalEvent(event)) {
            logger.debug(`[AutoMode] Plan approval required for ${event.featureId}`);
            setPendingPlanApproval({
              featureId: event.featureId,
              projectPath: event.projectPath || currentProject?.path || '',
              planContent: event.planContent,
              planningMode: event.planningMode,
            });
          }
          break;

        case 'planning_started':
          // Log when planning phase begins
          if (event.featureId && event.mode && event.message) {
            logger.debug(`[AutoMode] Planning started (${event.mode}) for ${event.featureId}`);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'planning',
              message: event.message,
              phase: 'planning',
            });
          }
          break;

        case 'plan_approved':
          // Log when plan is approved by user
          if (event.featureId) {
            logger.debug(`[AutoMode] Plan approved for ${event.featureId}`);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'action',
              message: event.hasEdits
                ? 'Plan approved with edits, starting implementation...'
                : 'Plan approved, starting implementation...',
              phase: 'action',
            });
          }
          break;

        case 'plan_auto_approved':
          // Log when plan is auto-approved (requirePlanApproval=false)
          if (event.featureId) {
            logger.debug(`[AutoMode] Plan auto-approved for ${event.featureId}`);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'action',
              message: 'Plan auto-approved, starting implementation...',
              phase: 'action',
            });
          }
          break;

        case 'plan_revision_requested':
          // Log when user requests plan revision with feedback
          if (event.featureId) {
            const revisionEvent = event as Extract<
              AutoModeEvent,
              { type: 'plan_revision_requested' }
            >;
            logger.debug(
              `[AutoMode] Plan revision requested for ${event.featureId} (v${revisionEvent.planVersion})`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'planning',
              message: `Revising plan based on feedback (v${revisionEvent.planVersion})...`,
              phase: 'planning',
            });
          }
          break;

        case 'auto_mode_task_started':
          // Task started - show which task is being worked on
          if (event.featureId && 'taskId' in event && 'taskDescription' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_started' }>;
            logger.debug(
              `[AutoMode] Task ${taskEvent.taskId} started for ${event.featureId}: ${taskEvent.taskDescription}`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'progress',
              message: `▶ Starting ${taskEvent.taskId}: ${taskEvent.taskDescription}`,
            });
          }
          break;

        case 'auto_mode_task_complete':
          // Task completed - show progress
          if (event.featureId && 'taskId' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_complete' }>;
            logger.debug(
              `[AutoMode] Task ${taskEvent.taskId} completed for ${event.featureId} (${taskEvent.tasksCompleted}/${taskEvent.tasksTotal})`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'progress',
              message: `✓ ${taskEvent.taskId} done (${taskEvent.tasksCompleted}/${taskEvent.tasksTotal})`,
            });
          }
          break;

        case 'auto_mode_phase_complete':
          // Phase completed (for full mode with phased tasks)
          if (event.featureId && 'phaseNumber' in event) {
            const phaseEvent = event as Extract<
              AutoModeEvent,
              { type: 'auto_mode_phase_complete' }
            >;
            logger.debug(
              `[AutoMode] Phase ${phaseEvent.phaseNumber} completed for ${event.featureId}`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'action',
              message: `Phase ${phaseEvent.phaseNumber} completed`,
              phase: 'action',
            });
          }
          break;
      }
    });

    return unsubscribe;
  }, [
    projectId,
    addRunningTask,
    removeRunningTask,
    addAutoModeActivity,
    getProjectIdFromPath,
    setPendingPlanApproval,
    setAutoModeRunning,
    currentProject?.path,
  ]);

  // Start auto mode - calls backend to start the auto loop
  const start = useCallback(async () => {
    if (!currentProject) {
      logger.error('No project selected');
      return;
    }

    try {
      const api = getElectronAPI();
      if (!api?.autoMode?.start) {
        throw new Error('Start auto mode API not available');
      }

      logger.info(
        `[AutoMode] Starting auto loop for ${currentProject.path} with maxConcurrency: ${maxConcurrency}`
      );

      // Optimistically update UI state (backend will confirm via event)
      setAutoModeSessionForProjectPath(currentProject.path, true);
      setAutoModeRunning(currentProject.id, true);

      // Call backend to start the auto loop
      const result = await api.autoMode.start(currentProject.path, maxConcurrency);

      if (!result.success) {
        // Revert UI state on failure
        setAutoModeSessionForProjectPath(currentProject.path, false);
        setAutoModeRunning(currentProject.id, false);
        logger.error('Failed to start auto mode:', result.error);
        throw new Error(result.error || 'Failed to start auto mode');
      }

      logger.debug(`[AutoMode] Started successfully`);
    } catch (error) {
      // Revert UI state on error
      setAutoModeSessionForProjectPath(currentProject.path, false);
      setAutoModeRunning(currentProject.id, false);
      logger.error('Error starting auto mode:', error);
      throw error;
    }
  }, [currentProject, setAutoModeRunning, maxConcurrency]);

  // Stop auto mode - calls backend to stop the auto loop
  const stop = useCallback(async () => {
    if (!currentProject) {
      logger.error('No project selected');
      return;
    }

    try {
      const api = getElectronAPI();
      if (!api?.autoMode?.stop) {
        throw new Error('Stop auto mode API not available');
      }

      logger.info(`[AutoMode] Stopping auto loop for ${currentProject.path}`);

      // Optimistically update UI state (backend will confirm via event)
      setAutoModeSessionForProjectPath(currentProject.path, false);
      setAutoModeRunning(currentProject.id, false);

      // Call backend to stop the auto loop
      const result = await api.autoMode.stop(currentProject.path);

      if (!result.success) {
        // Revert UI state on failure
        setAutoModeSessionForProjectPath(currentProject.path, true);
        setAutoModeRunning(currentProject.id, true);
        logger.error('Failed to stop auto mode:', result.error);
        throw new Error(result.error || 'Failed to stop auto mode');
      }

      // NOTE: Running tasks will continue until natural completion.
      // The backend stops picking up new features but doesn't abort running ones.
      logger.info('Stopped - running tasks will continue');
    } catch (error) {
      // Revert UI state on error
      setAutoModeSessionForProjectPath(currentProject.path, true);
      setAutoModeRunning(currentProject.id, true);
      logger.error('Error stopping auto mode:', error);
      throw error;
    }
  }, [currentProject, setAutoModeRunning]);

  // Stop a specific feature
  const stopFeature = useCallback(
    async (featureId: string) => {
      if (!currentProject) {
        logger.error('No project selected');
        return;
      }

      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.stopFeature) {
          throw new Error('Stop feature API not available');
        }

        const result = await api.autoMode.stopFeature(featureId);

        if (result.success) {
          removeRunningTask(currentProject.id, featureId);
          logger.info('Feature stopped successfully:', featureId);
          addAutoModeActivity({
            featureId,
            type: 'complete',
            message: 'Feature stopped by user',
            passes: false,
          });
        } else {
          logger.error('Failed to stop feature:', result.error);
          throw new Error(result.error || 'Failed to stop feature');
        }
      } catch (error) {
        logger.error('Error stopping feature:', error);
        throw error;
      }
    },
    [currentProject, removeRunningTask, addAutoModeActivity]
  );

  return {
    isRunning: isAutoModeRunning,
    runningTasks: runningAutoTasks,
    maxConcurrency,
    canStartNewTask,
    start,
    stop,
    stopFeature,
  };
}
