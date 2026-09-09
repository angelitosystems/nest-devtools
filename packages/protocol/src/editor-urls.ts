/**
 * Deep links that open a file at a specific line/column in an editor.
 * Paths are generated for the OS the DevTools *server* runs on — never assume
 * Windows or POSIX layout; detect it at runtime.
 */

export type EditorKind = 'vscode' | 'cursor' | 'zed' | 'sublime';

const EDITOR_SCHEMES: Record<EditorKind, string> = {
  vscode: 'vscode',
  cursor: 'cursor',
  zed: 'zed',
  sublime: 'subl',
};

/** Returns 'win32' | 'darwin' | 'linux' | 'unknown' without touching process when unavailable. */
export function detectPlatform(platformGetter?: () => string): 'win32' | 'darwin' | 'linux' | 'unknown' {
  try {
    const platform = platformGetter ? platformGetter() : process.platform;
    if (platform === 'win32' || platform === 'darwin' || platform === 'linux') return platform;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function encodeFilePath(absolutePath: string, platform: string): string {
  // VS Code expects forward slashes; keep drive letters like /C:/... on Windows.
  const normalized = platform === 'win32' ? absolutePath.replace(/\\/g, '/') : absolutePath;
  const withDrive = platform === 'win32' && /^[A-Za-z]:\//.test(normalized) ? `/${normalized}` : normalized;
  // the scheme already carries 'file/', so drop any leading slash;
  // preserve the drive-letter colon (C:) which VS Code expects unencoded
  return withDrive
    .replace(/^\//, '')
    .split('/')
    .map((segment, index) => (index === 0 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/');
}

/**
 * Build an editor deep link such as:
 *   vscode://file/Users/me/app/src/users.service.ts:87:21
 */
export function buildEditorUrl(
  editor: EditorKind,
  file: { absolutePath?: string; file?: string; line?: number; column?: number },
  platformGetter?: () => string,
): string | null {
  const absolutePath = file.absolutePath ?? file.file;
  if (!absolutePath) return null;

  const platform = detectPlatform(platformGetter);
  const scheme = EDITOR_SCHEMES[editor];
  const path = encodeFilePath(absolutePath, platform);
  const line = file.line ?? 1;
  const column = file.column ?? 1;

  if (editor === 'sublime') {
    return `subl://open?url=file://${path}&line=${line}&column=${column}`;
  }
  return `${scheme}://file/${path}:${line}:${column}`;
}

/** First available vscode:// link for a source location. */
export function vscodeUrl(file: { absolutePath?: string; file?: string; line?: number; column?: number }): string | null {
  return buildEditorUrl('vscode', file);
}

/** First available cursor:// link for a source location. */
export function cursorUrl(file: { absolutePath?: string; file?: string; line?: number; column?: number }): string | null {
  return buildEditorUrl('cursor', file);
}
