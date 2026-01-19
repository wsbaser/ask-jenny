/**
 * POST /status endpoint - Get auto mode status
 *
 * If projectPath is provided, returns per-project status including autoloop state.
 * If no projectPath, returns global status for backward compatibility.
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createStatusHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      // If projectPath is provided, return per-project status
      if (projectPath) {
        const projectStatus = autoModeService.getStatusForProject(projectPath);
        res.json({
          success: true,
          isRunning: projectStatus.runningCount > 0,
          isAutoLoopRunning: projectStatus.isAutoLoopRunning,
          runningFeatures: projectStatus.runningFeatures,
          runningCount: projectStatus.runningCount,
          maxConcurrency: projectStatus.maxConcurrency,
          projectPath,
        });
        return;
      }

      // Fall back to global status for backward compatibility
      const status = autoModeService.getStatus();
      const activeProjects = autoModeService.getActiveAutoLoopProjects();
      res.json({
        success: true,
        ...status,
        activeAutoLoopProjects: activeProjects,
      });
    } catch (error) {
      logError(error, 'Get status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
