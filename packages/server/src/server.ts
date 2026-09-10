import { createServer, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import express, { Express } from 'express';
import path from 'path';
import type { INestApplication } from '@nestjs/common';

export interface StartServerOptions {
  httpPort: number;
  wsPort: number;
  host?: string;
  nestApp?: INestApplication;
}

export interface DevToolsServerInstance {
  httpServer: HttpServer;
  wss: WebSocketServer;
  expressApp: Express;
  close: () => Promise<void>;
  /** Broadcast a message to all connected SDK clients */
  broadcast: (data: any) => void;
  /** Get currently connected clients */
  getClients: () => WebSocket[];
}

/**
 * Starts the embedded DevTools HTTP + WebSocket server
 * in the same process as the NestJS application.
 */
export async function startDevToolsServer(
  options: StartServerOptions,
): Promise<DevToolsServerInstance> {
  const { httpPort, wsPort, host = 'localhost', nestApp } = options;

  const expressApp = express();
  expressApp.use(express.json({ limit: '10mb' }));

  // Serve the dashboard static files
  // Adjust the path according to your build output
  const dashboardPath = path.join(__dirname, '../dashboard');
  expressApp.use(express.static(dashboardPath));

  // Health check
  expressApp.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      clients: clients.size,
      timestamp: new Date().toISOString(),
    });
  });

  // Simple info endpoint
  expressApp.get('/api/info', (_req, res) => {
    res.json({
      name: 'NestJS DevTools',
      version: '2.0.0',
      mode: 'embedded',
      ports: { http: httpPort, ws: wsPort },
    });
  });

  // Example: expose basic NestJS graph info if available
  expressApp.get('/api/graph', (_req, res) => {
    // You can expand this later with real introspection
    res.json({
      message: 'Graph endpoint – implement your introspection here',
      modules: [],
    });
  });

  // Fallback to dashboard for SPA routing
  expressApp.get('*', (_req, res) => {
    res.sendFile(path.join(dashboardPath, 'index.html'), (err) => {
      if (err) {
        res.status(404).send('Dashboard not found. Make sure the dashboard is built.');
      }
    });
  });

  const httpServer = createServer(expressApp);

  // WebSocket server (separate port for clarity, same process)
  const wss = new WebSocketServer({ port: wsPort, host });

  const clients = new Set<WebSocket>();

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    console.log(`[NestDevTools] SDK connected (${clients.size} total)`);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(ws, msg, nestApp);
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[NestDevTools] SDK disconnected (${clients.size} total)`);
    });

    // Welcome message
    ws.send(
      JSON.stringify({
        type: 'welcome',
        payload: {
          mode: 'embedded',
          message: 'Connected to NestJS DevTools (embedded mode)',
        },
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(httpPort, host, () => resolve());
  });

  const instance: DevToolsServerInstance = {
    httpServer,
    wss,
    expressApp,
    getClients: () => Array.from(clients),
    broadcast: (data: any) => {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
    },
    close: async () => {
      for (const client of clients) {
        client.close();
      }
      clients.clear();

      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });

      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
  };

  return instance;
}

function handleClientMessage(
  ws: WebSocket,
  msg: any,
  nestApp?: INestApplication,
) {
  // Extend this with your real protocol
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', payload: { ts: Date.now() } }));
      break;
    case 'get-info':
      ws.send(
        JSON.stringify({
          type: 'info',
          payload: {
            mode: 'embedded',
            hasNestApp: !!nestApp,
          },
        }),
      );
      break;
    default:
      // forward or ignore
      break;
  }
}
