import { writeOriginalConsole } from './instrumentation/console';

/** ANSI escape helpers (kept tiny and dependency-free, mirrors the CLI renderer). */
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

const WIDTH = 47;

function colorEnabled(): boolean {
  // Respect NO_COLOR / non-TTY output the same way most CLIs do.
  if (process.env['NO_COLOR']) return false;
  return Boolean(process.stdout?.isTTY);
}

function paint(color: string, text: string): string {
  return colorEnabled() ? `${color}${text}${RESET}` : text;
}

function pad(label: string, value: string): string {
  const line = ` ${paint(GRAY, label.padEnd(9))} ${paint(CYAN, value)}`;
  return line;
}

/** Prints the boxed "SDK started" banner once, right after init(). */
export function printStartupBanner(info: { endpoint: string; dashboard: string; project: string }): void {
  const top = `${paint(GRAY, '┌' + '─'.repeat(WIDTH) + '┐')}`;
  const bottom = `${paint(GRAY, '└' + '─'.repeat(WIDTH) + '┘')}`;
  const title = ` ${paint(BOLD + CYAN, 'NestJS DevTools')} ${paint(GREEN, '●')} ${paint(DIM, `(${info.project})`)}`;

  writeOriginalConsole('log', '');
  writeOriginalConsole('log', top);
  writeOriginalConsole('log', title);
  writeOriginalConsole('log', pad('Endpoint', info.endpoint));
  writeOriginalConsole('log', pad('Dashboard', info.dashboard));
  writeOriginalConsole('log', `${paint(GRAY, ' Estado')}    ${paint(YELLOW, '◌ conectando…')}`);
  writeOriginalConsole('log', bottom);
}

/** Prints a single status line once the transport's connection state is known. */
export function printConnectionStatus(state: 'open' | 'offline', dashboard: string): void {
  if (state === 'open') {
    writeOriginalConsole('log', ` ${paint(GREEN, '✓')} Conectado al dashboard ${paint(DIM, `(${dashboard})`)}`);
    return;
  }
  writeOriginalConsole('log', ` ${paint(YELLOW, '⚠')}  No se pudo conectar al dashboard todavía.`);
  writeOriginalConsole('log', `   ${paint(DIM, '¿Aún no lo instalaste? →')} ${paint(BOLD, 'bun add -g @angelitosystems/nest-devtools-cli')}`);
  writeOriginalConsole('log', `   ${paint(DIM, 'Luego, en otra terminal: →')} ${paint(BOLD, 'nest-devtools start')}`);
  writeOriginalConsole('log', `   ${paint(DIM, '(sin instalar, una sola vez: npx -p @angelitosystems/nest-devtools-cli nest-devtools start)')}`);
  writeOriginalConsole('log', `   ${paint(DIM, 'Reintentando en segundo plano — se conectará solo cuando el dashboard esté arriba.')}`);
}