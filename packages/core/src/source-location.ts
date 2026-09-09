import { isAbsolute, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { SourceLocation } from '@angelitosystems/devtools-protocol';

interface StackFrame {
  file: string | null;
  line: number;
  column: number;
  function?: string;
}

const NODE_INTERNAL = /^node:|^internal[\\/]/;

/**
 * Resolve the most relevant SourceLocation from an Error or raw stack string.
 * When the host app registers source-map-support, stack frames already carry
 * original paths — we simply pick the first user-land frame.
 */
export function resolveSourceLocation(
  errorOrStack: Error | string,
  options?: { skip?: number; projectRoot?: string },
): SourceLocation | undefined {
  const stack = typeof errorOrStack === 'string' ? errorOrStack : (errorOrStack.stack ?? '');
  if (!stack) return undefined;

  const frames = parseStack(stack);
  const skip = options?.skip ?? 0;
  const frame =
    frames.slice(skip).find((f) => isUserFrame(f, options?.projectRoot)) ??
    frames.find((f) => isUserFrame(f, options?.projectRoot));

  if (!frame || !frame.file) return undefined;

  const location: SourceLocation = {
    file: frame.file,
    line: frame.line,
    column: frame.column,
  };
  if (frame.function) location.function = frame.function;
  const absolute = toAbsolutePath(frame.file, options?.projectRoot);
  if (absolute) location.absolutePath = absolute;
  return location;
}

/** Parse V8/JSC-style stack lines into structured frames. */
export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    // "at fn (file:1:2)" or "at file:1:2"
    const match = /\s*at\s+(?:(.+?)\s+\()?([^\s()]+?):(\d+):(\d+)\)?/.exec(line);
    if (!match) continue;
    const fn = match[1] ? match[1].replace(/\s+\[as\s+.+\]$/, '') : undefined;
    const file = match[2];
    const lineNum = Number(match[3]);
    const colNum = Number(match[4]);
    if (Number.isNaN(lineNum) || Number.isNaN(colNum)) continue;
    frames.push({ file, line: lineNum, column: colNum, function: fn });
  }
  return frames;
}

function isUserFrame(frame: StackFrame, projectRoot?: string): boolean {
  if (!frame.file) return false;
  if (NODE_INTERNAL.test(frame.file)) return false;
  if (isSdkFile(frame.file)) return false;
  if (projectRoot) {
    return toAbsolutePath(frame.file, projectRoot)?.startsWith(projectRoot) ?? true;
  }
  return true;
}

/** True when the frame belongs to the DevTools SDK itself (never report as user code). */
export function isSdkFile(file: string): boolean {
  return /devtools|nest-devtools/i.test(file) && !/examples?[\\/]/.test(file);
}

function toAbsolutePath(file: string, projectRoot?: string): string | undefined {
  try {
    if (file.startsWith('file://')) file = fileURLToPath(file);
    if (isAbsolute(file)) return normalize(file);
    return resolve(projectRoot ?? process.cwd(), file);
  } catch {
    return undefined;
  }
}
