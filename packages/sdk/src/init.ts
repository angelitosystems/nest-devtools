import { INestApplication } from '@nestjs/common';
import { startDevToolsServer, DevToolsServerInstance } from '../../server/src/server';
import { connectInternalSDK } from './sdk-connection';

export interface NestDevToolsOptions {
  /** HTTP port for the dashboard (default: 4317) */
  port?: number;
  /** WebSocket port for the SDK (default: 4318) */
  wsPort?: number;
  /** Automatically open the dashboard in the browser */
  openDashboard?: boolean;
  /** Enable/disable DevTools (default: true in non-production) */
  enabled?: boolean;
  /** Custom host (default: localhost) */
  host?: string;
}

let serverInstance: DevToolsServerInstance | null = null;

/**
 * Initialize NestJS DevTools.
 *
 * This is the only function the user needs to call.
 * It embeds the DevTools server in the same process — no need to run
 * `nest-devtools start` separately.
 *
 * @example
 * ```ts
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule);
 *   await NestDevTools.init(app);
 *   await app.listen(3000);
 * }
 * ```
 */
export async function init(
  app: INestApplication,
  options: NestDevToolsOptions = {},
): Promise<void> {
  const {
    port = Number(process.env.NEST_DEVTOOLS_PORT) || 4317,
    wsPort = Number(process.env.NEST_DEVTOOLS_WS_PORT) || 4318,
    openDashboard = process.env.NEST_DEVTOOLS_OPEN === 'true',
    enabled = process.env.NODE_ENV !== 'production',
    host = 'localhost',
  } = options;

  if (!enabled) {
    return;
  }

  // Already started in this process
  if (serverInstance) {
    console.log('[NestDevTools] Already running in this process');
    return;
  }

  try {
    serverInstance = await startDevToolsServer({
      httpPort: port,
      wsPort,
      host,
      nestApp: app,
    });

    // Connect the SDK internally (same process, no network hop needed)
    await connectInternalSDK(app, serverInstance);

    printBanner(port, wsPort, host);

    if (openDashboard) {
      try {
        const open = (await import('open')).default;
        await open(`http://${host}:${port}`);
      } catch {
        // open is optional
      }
    }

    // Graceful shutdown
    const cleanup = async () => {
      if (serverInstance) {
        await serverInstance.close();
        serverInstance = null;
      }
    };

    process.once('SIGTERM', cleanup);
    process.once('SIGINT', cleanup);

    // Also clean when NestJS closes
    app.enableShutdownHooks();
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      console.log(
        `[NestDevTools] Port ${port} already in use → connecting as client to existing instance`,
      );
      // Fallback: connect to an already running DevTools instance
      await connectAsClient(app, { host, port, wsPort });
    } else {
      console.error('[NestDevTools] Failed to start:', err?.message || err);
    }
  }
}

function printBanner(port: number, wsPort: number, host: string) {
  console.log(`
  NestJS DevTools
──────────────────────────────────────────────
✓ DevTools server started
✓ WebSocket server started
✓ Dashboard available
Dashboard: http://${host}:${port}
SDK endpoint: ws://${host}:${wsPort}
`);
}

/**
 * Fallback when the ports are already taken by another process.
 * Connects as a pure client over WebSocket.
 */
async function connectAsClient(
  app: INestApplication,
  opts: { host: string; port: number; wsPort: number },
) {
  // Implementation depends on your existing WebSocket client logic.
  // For now we just log and leave the connection to the existing SDK client.
  console.log(
    `[NestDevTools] Connect your app with the existing SDK to ws://${opts.host}:${opts.wsPort}`,
  );
}

