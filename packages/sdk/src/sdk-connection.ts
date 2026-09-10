import { INestApplication } from '@nestjs/common';
import { DevToolsServerInstance } from '../../server/src/server';

/**
 * Internal connection used when DevTools runs in the same process.
 * No real network hop is needed.
 */
export async function connectInternalSDK(
  app: INestApplication,
  server: DevToolsServerInstance,
): Promise<void> {
  // Here you can:
  // 1. Attach request/response interceptors
  // 2. Collect module graph
  // 3. Push live events to the dashboard via server.broadcast()

  // Example: simple heartbeat so the dashboard knows the backend is alive
  const heartbeat = setInterval(() => {
    server.broadcast({
      type: 'heartbeat',
      payload: {
        uptime: process.uptime(),
        memory: process.memoryUsage().heapUsed,
        timestamp: Date.now(),
      },
    });
  }, 5000);

  // Clean up when the server closes
  const originalClose = server.close.bind(server);
  server.close = async () => {
    clearInterval(heartbeat);
    await originalClose();
  };

  // Mark this connection as the "backend"
  server.broadcast({
    type: 'sdk-connected',
    payload: {
      name: 'backend',
      id: 'backend',
      mode: 'embedded',
    },
  });
}
