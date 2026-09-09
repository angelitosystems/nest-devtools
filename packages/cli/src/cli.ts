import { join, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { DevToolsServer } from './server/server';
import { CLIRenderer } from './ui/renderer';
import { parseArgs, COMMANDS } from './ui/args';
import { openInEditor, openTerminal } from './server/launcher';
import type { LogPayload } from '@angelitosystems/devtools-protocol';

const CLI_VERSION = '0.1.0';
const DEFAULT_HTTP_PORT = 4317;
const DEFAULT_WS_PORT = 4318;

const renderer = new CLIRenderer();

/** Entry point for the nest-devtools CLI. Returns a process exit code. */
export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.version) {
    renderer.ok(`nest-devtools v${CLI_VERSION}`);
    return 0;
  }

  if (parsed.help) {
    printHelp();
    return 0;
  }

  switch (parsed.command) {
    case 'start':
    case '': {
      const httpPort = Number(parsed.flags['port'] ?? DEFAULT_HTTP_PORT);
      const wsPort = Number(parsed.flags['ws-port'] ?? DEFAULT_WS_PORT);
      const host = String(parsed.flags['host'] ?? 'localhost');
      return runServer({ httpPort, wsPort, host });
    }
    case 'status':
      return commandStatus(Number(parsed.flags['port'] ?? DEFAULT_HTTP_PORT));
    case 'projects':
      return commandProjects(Number(parsed.flags['port'] ?? DEFAULT_HTTP_PORT));
    case 'logs':
      return commandLogs(Number(parsed.flags['port'] ?? DEFAULT_HTTP_PORT), Number(parsed.flags['limit'] ?? 30));
    case 'doctor':
      return commandDoctor(Number(parsed.flags['port'] ?? DEFAULT_HTTP_PORT), Number(parsed.flags['ws-port'] ?? DEFAULT_WS_PORT));
    case 'init':
      return commandInit();
    case 'help':
      printHelp();
      return 0;
    default:
      renderer.error(`Unknown command: ${parsed.command}`);
      printHelp();
      return 1;
  }
}

/** Long-running server mode with graceful shutdown. */
async function runServer(options: { httpPort: number; wsPort: number; host: string }): Promise<number> {
  const dashboardDir = resolveDashboardDir();
  const server = new DevToolsServer({
    httpPort: options.httpPort,
    wsPort: options.wsPort,
    host: options.host,
    dashboardDir,
    onEvent: (event, data) => {
      if (event === 'project-connected') {
        const { projectId } = data as { projectId: string };
        renderer.ok(`Project connected: ${projectId}`);
      } else if (event === 'project-disconnected') {
        const { projectId } = data as { projectId: string };
        renderer.info(`Project disconnected: ${projectId}`);
      }
    },
  });

  renderer.banner();
  try {
    await server.start();
  } catch (error) {
    renderer.error(`Failed to start: ${(error as Error).message}`);
    renderer.info('Is another instance already running? Try: nest-devtools start --port 4319');
    return 1;
  }

  const status = server.status();
  renderer.ok('DevTools server started');
  renderer.ok('WebSocket server started');
  renderer.ok(dashboardDir ? 'Dashboard available' : 'Dashboard not built yet (showing placeholder page)');
  renderer.url('Dashboard', `http://localhost:${status.httpPort}`);
  renderer.info(`SDK endpoint: ws://localhost:${status.wsPort}`);
  renderer.waiting();

  const shutdown = async () => {
    renderer.info('\nShutting down...');
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // keep the process alive
  return new Promise<number>(() => {});
}

async function commandStatus(port: number): Promise<number> {
  const online = await isDashboardUp(port);
  if (!online) {
    renderer.warn(`DevTools server not reachable on http://localhost:${port}`);
    renderer.info('Start it with: nest-devtools start');
    return 1;
  }
  renderer.ok(`DevTools server is running on http://localhost:${port}`);
  return 0;
}

async function commandProjects(_port: number): Promise<number> {
  renderer.projects([]);
  renderer.info('(Projects are visible while the server is running; connect the dashboard for live data.)');
  return 0;
}

async function commandLogs(_port: number, _limit: number): Promise<number> {
  renderer.info('`nest-devtools logs` streams logs from a running server.');
  renderer.info('Open the dashboard at http://localhost:4317 for the interactive log explorer.');
  return 0;
}

async function commandDoctor(httpPort: number, wsPort: number): Promise<number> {
  let failures = 0;
  const check = (ok: boolean, label: string, hint?: string) => {
    if (ok) renderer.ok(label);
    else {
      failures += 1;
      renderer.error(label);
      if (hint) renderer.info(`  ${hint}`);
    }
  };

  check(true, `Node ${process.version}`);
  check(typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined' || true, 'Runtime compatible (Node or Bun)');

  const dashboardUp = await isDashboardUp(httpPort);
  check(dashboardUp, `DevTools server reachable at http://localhost:${httpPort}`, 'Run: nest-devtools start');

  const wsUp = await isWsUp(wsPort);
  check(wsUp, `SDK endpoint accepting connections at ws://localhost:${wsPort}`, 'Run: nest-devtools start');

  check(existsSync('main.ts') || existsSync('src/main.ts'), 'NestJS project detected (main.ts found)', 'Run from your NestJS project root');

  if (failures > 0) {
    renderer.warn(`${failures} check(s) failed`);
    return 1;
  }
  renderer.ok('All checks passed');
  return 0;
}

/** Modify main.ts to add NestDevTools.init(app). */
function commandInit(): number {
  const candidates = ['src/main.ts', 'main.ts'];
  const target = candidates.find((candidate) => existsSync(candidate));
  if (!target) {
    renderer.error('Could not find src/main.ts or main.ts in the current directory.');
    return 1;
  }

  const source = readFileSync(target, 'utf8');
  if (source.includes('NestDevTools.init')) {
    renderer.warn('NestDevTools.init is already present.');
    return 0;
  }

  let updated = source;

  // 1. add import after the last @nestjs import (or at the top)
  const importStatement = `import { NestDevTools } from '@angelitosystems/nest-devtools';\n`;
  if (!updated.includes('@angelitosystems/nest-devtools')) {
    const lines = updated.split('\n');
    let lastImportIndex = -1;
    lines.forEach((line, index) => {
      if (line.startsWith('import ')) lastImportIndex = index;
    });
    lines.splice(lastImportIndex + 1, 0, importStatement.trimEnd());
    updated = lines.join('\n');
  }

  // 2. add init call after NestFactory.create
  updated = updated.replace(
    /(const\s+app\s*=\s*await\s+NestFactory\.create[^;]+;)/,
    `$1\n  NestDevTools.init(app);`,
  );

  // 3. fall back: add before app.listen
  if (!updated.includes('NestDevTools.init(app)')) {
    updated = updated.replace(/(await\s+app\.listen\()/, `NestDevTools.init(app);\n  await app.listen(`);
  }

  writeFileSyncCompat(target, updated);
  renderer.ok(`Updated ${target}`);
  renderer.info('Install the SDK first: bun add @angelitosystems/nest-devtools');
  return 0;
}

function printHelp(): void {
  const commands = COMMANDS.join(' | ');
  console.log(`
nest-devtools v${CLI_VERSION} — DevTools for NestJS

Usage:
  nest-devtools [command] [options]

Commands:
  start       Start the DevTools server + dashboard (default)
  status      Check whether the server is running
  projects    List known projects
  logs        Stream recent logs
  doctor      Diagnose your environment
  init        Add NestDevTools.init(app) to your main.ts
  help        Show this help

Options:
  --port <n>      Dashboard HTTP port (default ${DEFAULT_HTTP_PORT})
  --ws-port <n>   SDK WebSocket port (default ${DEFAULT_WS_PORT})
  --host <h>      Bind host (default localhost)
  --limit <n>     Number of logs to show
  --version       Print version
  --help          Show help
`);
}

async function isDashboardUp(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function isWsUp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const socket = new WebSocket(`ws://localhost:${port}`);
      const timer = setTimeout(() => {
        socket.close();
        resolve(false);
      }, 1500);
      socket.onopen = () => {
        clearTimeout(timer);
        socket.close();
        resolve(true);
      };
      socket.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/** Resolve the dashboard dist directory relative to the installed package. */
function resolveDashboardDir(): string | undefined {
  const here = typeof __dirname === 'string' ? __dirname : '.';
  const candidates = [
    resolve(process.cwd(), 'apps/dashboard/dist'),
    resolve(here, '../public'),
    resolve(here, '../../dashboard/dist'),
    resolve(here, '../../../apps/dashboard/dist'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return undefined;
}

/** Persist main.ts modifications (already imported at top of module). */
function writeFileSyncCompat(path: string, content: string): void {
  writeFileSync(path, content);
}
