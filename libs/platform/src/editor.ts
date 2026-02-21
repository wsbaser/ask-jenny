/**
 * Cross-platform editor and terminal launching utilities
 */

import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Platform detection
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

/**
 * Escape a string for safe use in shell commands
 * Handles paths with spaces, special characters, etc.
 */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Check if a CLI command exists in PATH
 * Uses platform-specific command lookup (where on Windows, which on Unix)
 */
export async function commandExists(cmd: string): Promise<boolean> {
  try {
    const whichCmd = isWindows ? 'where' : 'which';
    await execFileAsync(whichCmd, [cmd]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open a path in VS Code
 *
 * Uses `code.cmd` on Windows, `code` on macOS/Linux.
 *
 * @param targetPath - The file or directory path to open
 */
export async function openInVSCode(targetPath: string): Promise<void> {
  const command = isWindows ? 'code.cmd' : 'code';

  if (isWindows) {
    return new Promise((resolve, reject) => {
      const child: ChildProcess = spawn(command, [targetPath], {
        shell: true,
        stdio: 'ignore',
        detached: true,
      });
      child.unref();
      child.on('error', (err) => reject(err));
      setTimeout(() => resolve(), 100);
    });
  }

  await execFileAsync(command, [targetPath]);
}

/**
 * Open a terminal in the specified directory
 *
 * Handles cross-platform differences:
 * - On macOS, uses Terminal.app via AppleScript
 * - On Windows, uses Windows Terminal (wt) or falls back to cmd
 * - On Linux, uses common terminal emulators
 *
 * @param targetPath - The directory path to open the terminal in
 */
export async function openInTerminal(targetPath: string): Promise<{ terminalName: string }> {
  if (isMac) {
    const script = `
      tell application "Terminal"
        do script "cd ${escapeShellArg(targetPath)}"
        activate
      end tell
    `;
    await execFileAsync('osascript', ['-e', script]);
    return { terminalName: 'Terminal' };
  } else if (isWindows) {
    const hasWindowsTerminal = await commandExists('wt');
    if (hasWindowsTerminal) {
      return await new Promise((resolve, reject) => {
        const child: ChildProcess = spawn('wt', ['-d', targetPath], {
          shell: true,
          stdio: 'ignore',
          detached: true,
        });
        child.unref();
        child.on('error', (err) => reject(err));
        setTimeout(() => resolve({ terminalName: 'Windows Terminal' }), 100);
      });
    }
    return await new Promise((resolve, reject) => {
      const child: ChildProcess = spawn(
        'cmd',
        ['/c', 'start', 'cmd', '/k', `cd /d "${targetPath}"`],
        {
          shell: true,
          stdio: 'ignore',
          detached: true,
        }
      );
      child.unref();
      child.on('error', (err) => reject(err));
      setTimeout(() => resolve({ terminalName: 'Command Prompt' }), 100);
    });
  } else {
    const terminals = [
      {
        name: 'GNOME Terminal',
        command: 'gnome-terminal',
        args: ['--working-directory', targetPath],
      },
      { name: 'Konsole', command: 'konsole', args: ['--workdir', targetPath] },
      {
        name: 'xfce4-terminal',
        command: 'xfce4-terminal',
        args: ['--working-directory', targetPath],
      },
      {
        name: 'xterm',
        command: 'xterm',
        args: ['-e', 'sh', '-c', `cd ${escapeShellArg(targetPath)} && $SHELL`],
      },
      {
        name: 'x-terminal-emulator',
        command: 'x-terminal-emulator',
        args: ['--working-directory', targetPath],
      },
    ];

    for (const terminal of terminals) {
      if (await commandExists(terminal.command)) {
        await execFileAsync(terminal.command, terminal.args);
        return { terminalName: terminal.name };
      }
    }

    throw new Error('No terminal emulator found');
  }
}
