/**
 * POST /open-in-editor endpoint - Open a worktree directory in VS Code
 */

import type { Request, Response } from 'express';
import { isAbsolute } from 'path';
import { openInVSCode } from '@automaker/platform';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('open-in-editor');

export function createOpenInEditorHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as { worktreePath: string };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      if (!isAbsolute(worktreePath)) {
        res.status(400).json({
          success: false,
          error: 'worktreePath must be an absolute path',
        });
        return;
      }

      await openInVSCode(worktreePath);
      res.json({
        success: true,
        result: {
          message: `Opened ${worktreePath} in VS Code`,
          editorName: 'VS Code',
        },
      });
    } catch (error) {
      logError(error, 'Open in editor failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
