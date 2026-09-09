import { exec } from 'child_process';
import { platform } from 'os';

/**
 * OS-aware launcher helpers. Every command is best effort and never throws;
 * callbacks receive an error when the launch failed.
 */

/** Open a file at line:column in VS Code or Cursor. */
export function openInEditor(
  editor: 'vscode' | 'cursor',
  file: string,
  onDone?: (error?: Error) => void,
): void {
  const os = platform();
  const command = editor === 'cursor' ? 'cursor' : 'code';
  const args = [`--goto`, `${file}`];

  if (os === 'win32') {
    exec(`start "" ${command} ${args.map(quote).join(' ')}`, { shell: 'cmd.exe' }, (err) => onDone?.(err ?? undefined));
  } else if (os === 'darwin') {
    exec(`open -a "${editor === 'cursor' ? 'Cursor' : 'Visual Studio Code'}" ${args.map(quote).join(' ')}`, (err) =>
      onDone?.(err ?? undefined),
    );
  } else {
    exec(`${command} ${args.map(quote).join(' ')}`, (err) => onDone?.(err ?? undefined));
  }
}

/** Open a terminal in the given directory. */
export function openTerminal(dir: string, onDone?: (error?: Error) => void): void {
  const os = platform();
  if (os === 'win32') {
    exec(`start "" cmd /K "cd /d ${quote(dir)}"`, { shell: 'cmd.exe' }, (err) => onDone?.(err ?? undefined));
  } else if (os === 'darwin') {
    exec(`open -a Terminal ${quote(dir)}`, (err) => onDone?.(err ?? undefined));
  } else {
    // try common terminals; ignore failures
    for (const cmd of [`x-terminal-emulator --working-directory=${quote(dir)}`, `xterm -e cd ${quote(dir)} && bash`]) {
      exec(cmd, (err) => {
        if (!err) onDone?.();
      });
    }
    onDone?.();
  }
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}
