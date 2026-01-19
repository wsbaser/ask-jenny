/**
 * POST /stop endpoint - Stop auto mode loop for a project
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createStopHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Check if running
      if (!autoModeService.isAutoLoopRunningForProject(projectPath)) {
        res.json({
          success: true,
          message: 'Auto mode is not running for this project',
          wasRunning: false,
        });
        return;
      }

      // Stop the auto loop for this project
      const runningCount = await autoModeService.stopAutoLoopForProject(projectPath);

      logger.info(
        `Stopped auto loop for project: ${projectPath}, ${runningCount} features still running`
      );

      res.json({
        success: true,
        message: 'Auto mode stopped',
        runningFeaturesCount: runningCount,
      });
    } catch (error) {
      logError(error, 'Stop auto mode failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
