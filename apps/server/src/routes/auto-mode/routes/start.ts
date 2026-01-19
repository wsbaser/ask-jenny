/**
 * POST /start endpoint - Start auto mode loop for a project
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createStartHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, maxConcurrency } = req.body as {
        projectPath: string;
        maxConcurrency?: number;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Check if already running
      if (autoModeService.isAutoLoopRunningForProject(projectPath)) {
        res.json({
          success: true,
          message: 'Auto mode is already running for this project',
          alreadyRunning: true,
        });
        return;
      }

      // Start the auto loop for this project
      await autoModeService.startAutoLoopForProject(projectPath, maxConcurrency ?? 3);

      logger.info(
        `Started auto loop for project: ${projectPath} with maxConcurrency: ${maxConcurrency ?? 3}`
      );

      res.json({
        success: true,
        message: `Auto mode started with max ${maxConcurrency ?? 3} concurrent features`,
      });
    } catch (error) {
      logError(error, 'Start auto mode failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
