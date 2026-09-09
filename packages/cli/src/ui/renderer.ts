/** ANSI escape helpers (kept tiny and dependency-free). */
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

/** Terminal output renderer for the nest-devtools CLI. */
export class CLIRenderer {
  /** Startup banner. */
  banner(): void {
    const line = '─'.repeat(46);
    console.log(`${CYAN}${BOLD}`);
    console.log('  NestJS DevTools');
    console.log(`${RESET}${GRAY}${line}${RESET}`);
  }

  /** Green check line. */
  ok(message: string): void {
    console.log(`${GREEN}✓${RESET} ${message}`);
  }

  /** Yellow warning line. */
  warn(message: string): void {
    console.log(`${YELLOW}!${RESET} ${message}`);
  }

  /** Red error line. */
  error(message: string): void {
    console.log(`${RED}✗${RESET} ${message}`);
  }

  /** Dimmed info line. */
  info(message: string): void {
    console.log(`${DIM}${message}${RESET}`);
  }

  /** Highlighted URL line. */
  url(label: string, value: string): void {
    console.log(`\n${BOLD}${label}:${RESET} ${CYAN}${value}${RESET}\n`);
  }

  /** Key/value status table. */
  statusTable(rows: Array<[string, string | number | boolean]>): void {
    const width = Math.max(...rows.map(([k]) => k.length));
    for (const [key, value] of rows) {
      console.log(`  ${GRAY}${key.padEnd(width)}${RESET}  ${String(value)}`);
    }
  }

  /** Project list with connection dots. */
  projects(projects: Array<{ projectId: string; connected: boolean; environment: string; lastSeenAt: number }>): void {
    if (projects.length === 0) {
      this.info('No projects have connected yet.');
      this.info('Start your NestJS app with the SDK installed and it will appear here.');
      return;
    }
    for (const project of projects) {
      const dot = project.connected ? `${GREEN}●${RESET}` : `${GRAY}○${RESET}`;
      const when = `${DIM}(${formatRelative(project.lastSeenAt)})${RESET}`;
      console.log(`${dot} ${BOLD}${project.projectId}${RESET} ${DIM}${project.environment}${RESET} ${when}`);
    }
  }

  /** Render recent logs. */
  logs(logs: Array<{ level: string; message: string; timestamp: number; context?: string }>, limit: number): void {
    if (logs.length === 0) {
      this.info('No logs captured yet.');
      return;
    }
    for (const log of logs.slice(-limit)) {
      const color = log.level === 'error' ? RED : log.level === 'warn' ? YELLOW : log.level === 'debug' ? GRAY : CYAN;
      const time = new Date(log.timestamp).toLocaleTimeString();
      const context = log.context ? `${DIM}[${log.context}]${RESET} ` : '';
      console.log(`${GRAY}${time}${RESET} ${color}${log.level.toUpperCase().padEnd(5)}${RESET} ${context}${log.message}`);
    }
  }

  /** Waiting-for-apps footer. */
  waiting(): void {
    console.log(`${DIM}Waiting for NestJS applications... (Ctrl+C to stop)${RESET}`);
  }
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
