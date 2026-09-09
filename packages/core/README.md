# @angelitosystems/devtools-core

> Componentes independientes del framework para construir integraciones con NestJS DevTools.

`devtools-core` proporciona el transporte WebSocket, el contexto de peticiones, la configuracion, las metricas y el singleton interno que utiliza el SDK de NestJS.

## Instalacion

```bash
npm install @angelitosystems/devtools-core
```

```bash
bun add @angelitosystems/devtools-core
```

Para una aplicacion NestJS normal, instala [`@angelitosystems/nest-devtools`](../nestjs) en lugar de utilizar este paquete directamente.

## API principal

- `DevToolsTransport`: conexion WebSocket con reintentos, buffer acotado, batching y backpressure.
- `requestContext()`: contexto basado en `AsyncLocalStorage` para correlacionar eventos con una peticion.
- `resolveConfig()` y `DevToolsUserConfig`: configuracion desde opciones y variables de entorno.
- `devtools`: singleton interno que inicializa el transporte y publica eventos.
- `getProcessMetrics()` y utilidades de metricas de rendimiento.
- Utilidades de localizacion de origen para stacks y enlaces de editor.

## Contexto de peticiones

```ts
import { requestContext } from '@angelitosystems/devtools-core';

const context = requestContext();

context.run(
  { requestId: 'req_123', method: 'GET', url: '/cats', startedAt: Date.now() },
  () => {
    console.log(context.requestId());
    context.patch({ userId: 'user_42' });
  },
);
```

Fuera de una peticion, `current()` y `requestId()` devuelven `undefined`.

## Transporte WebSocket

```ts
import { DevToolsTransport } from '@angelitosystems/devtools-core';

const transport = new DevToolsTransport('ws://localhost:4318', {
  projectId: 'catalog-api',
});

transport.start();
transport.send('log.created', {
  projectId: 'catalog-api',
  level: 'info',
  message: 'ready',
  processId: process.pid,
  timestamp: Date.now(),
});

transport.stop();
```

El transporte no bloquea la aplicacion, conserva una cantidad limitada de eventos cuando el servidor esta desconectado y reintenta con backoff. Los eventos se tipan con `@angelitosystems/devtools-protocol`.

## Configuracion

```ts
import { resolveConfig } from '@angelitosystems/devtools-core';

const config = resolveConfig({
  project: 'catalog-api',
  server: 'ws://localhost:4318',
  sampling: 0.5,
  capture: { logs: true, requests: true },
});
```

Tambien admite `NEST_DEVTOOLS_URL`, `NEST_DEVTOOLS_PROJECT`, `NEST_DEVTOOLS_ENABLED`, `NEST_DEVTOOLS_ENV`, `NEST_DEVTOOLS_SAMPLING` y `NEST_DEVTOOLS_TOKEN`.

## Desarrollo

```bash
bun run --cwd packages/core build
bun test packages/core
```

## Licencia

MIT. Consulta [`docs/architecture.md`](../../docs/architecture.md) para el diseno del transporte y la relacion entre paquetes.
