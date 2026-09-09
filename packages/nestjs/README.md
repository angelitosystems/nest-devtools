# @angelitosystems/nest-devtools

> Debugging y observabilidad en tiempo real para aplicaciones NestJS.

Anade instrumentacion para peticiones HTTP, logs, errores, rendimiento, grafo de la aplicacion y, de forma opcional, WebSockets y base de datos. El SDK no debe detener ni romper la aplicacion si el servidor DevTools no esta disponible.

## Requisitos

- Node.js 18 o superior, o Bun 1.1 o superior.
- NestJS 9, 10 u 11.
- `reflect-metadata` y `rxjs`, normalmente ya presentes en una aplicacion NestJS.

## Instalacion

```bash
npm install @angelitosystems/nest-devtools
```

```bash
bun add @angelitosystems/nest-devtools
```

El servidor y el dashboard se instalan aparte con [`@angelitosystems/nest-devtools-cli`](../cli).

## Uso

Anade una linea despues de crear la aplicacion y antes de `listen()`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestDevTools } from '@angelitosystems/nest-devtools';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  NestDevTools.init(app);
  await app.listen(3000);
}

bootstrap();
```

Despues inicia el CLI y abre `http://localhost:4317`:

```bash
npx @angelitosystems/nest-devtools-cli
```

## Configuracion

```ts
NestDevTools.init(app, {
  project: 'catalog-api',
  environment: 'development',
  server: 'ws://localhost:4318',
  capture: {
    requests: true,
    logs: true,
    errors: true,
    performance: true,
    database: true,
    websockets: true,
  },
  redact: ['customerSecret'],
  allow: ['publicToken'],
});
```

Opciones y variables de entorno principales:

| Opcion | Variable | Valor predeterminado |
|---|---|---|
| `enabled` | `NEST_DEVTOOLS_ENABLED` | Activo fuera de `production` |
| `server` | `NEST_DEVTOOLS_URL` | `ws://localhost:4318` |
| `project` | `NEST_DEVTOOLS_PROJECT` | Nombre del proyecto |
| `token` | `NEST_DEVTOOLS_TOKEN` | Sin token |
| `sampling` | `NEST_DEVTOOLS_SAMPLING` | `1` |

En produccion el SDK se desactiva por defecto. Activalo explicitamente solo si necesitas capturar datos alli y has revisado la configuracion de redaccion.

## API adicional

```ts
import {
  NestDevTools,
  captureError,
  requestContext,
} from '@angelitosystems/nest-devtools';

captureError(new Error('Database unavailable'));
const requestId = requestContext().requestId();
```

`NestDevTools.init()` devuelve un `InitResult` con `enabled`, `projectId`, `projectName`, `server` y, cuando corresponde, la razon de una desactivacion.

## Desarrollo

```bash
bun run --cwd packages/nestjs build
bun test packages/nestjs
```

## Licencia

MIT. Consulta la guia completa en [`docs/quick-start.md`](../../docs/quick-start.md) y [`docs/configuration.md`](../../docs/configuration.md).
