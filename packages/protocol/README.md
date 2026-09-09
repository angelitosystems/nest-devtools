# @angelitosystems/devtools-protocol

> Tipos y utilidades compartidas para el protocolo WebSocket de NestJS DevTools.

Este paquete define el contrato entre el SDK, el servidor y el dashboard. No tiene dependencias de runtime y puede utilizarse en Node.js, Bun o una aplicacion web.

## Instalacion

```bash
npm install @angelitosystems/devtools-protocol
```

```bash
bun add @angelitosystems/devtools-protocol
```

## Exportaciones

El paquete exporta:

- `DevToolsMessage`, `DevToolsEvent`, `DevToolsEventMap` y los payloads tipados.
- `DevToolsEventName` y `PROTOCOL_VERSION`.
- `createMessage`, `parseMessage` y `randomId` para construir y validar mensajes.
- `Redactor`, `redactValue`, `redactText` y `defaultRedactor`.
- Utilidades para enlaces profundos de VS Code y Cursor.

## Crear un mensaje tipado

```ts
import {
  createMessage,
  PROTOCOL_VERSION,
  type DevToolsMessage,
  type LogPayload,
} from '@angelitosystems/devtools-protocol';

const payload: LogPayload = {
  projectId: 'catalog-api',
  level: 'info',
  message: 'Application started',
  processId: process.pid,
  timestamp: Date.now(),
};

const message: DevToolsMessage<LogPayload> = createMessage(
  'log.created',
  payload,
  { projectId: 'catalog-api' },
);

console.log(PROTOCOL_VERSION, message.event, message.payload.message);
```

Los nombres de evento y sus payloads estan relacionados mediante `DevToolsEventMap`; TypeScript detectara un payload incompatible con el evento elegido.

## Redaccion de datos

Antes de enviar informacion de una aplicacion, puedes eliminar secretos con el redactor incluido:

```ts
import { Redactor } from '@angelitosystems/devtools-protocol';

const redactor = new Redactor({ redact: ['internalId'] });

redactor.redact({ password: 'secret', email: 'dev@example.com' });
// { password: '[REDACTED]', email: 'dev@example.com' }
```

La politica predeterminada cubre contrasenas, tokens, cookies, autorizaciones, claves privadas y nombres sensibles similares. Tambien limita la profundidad y el tamano de los valores capturados.

## Compatibilidad

`PROTOCOL_VERSION` es `1`. Un cambio incompatible en el envelope o en los payloads requiere incrementar esta version.

## Desarrollo

Desde el monorepo:

```bash
bun run --cwd packages/protocol build
bun test packages/protocol
```

## Licencia

MIT. Consulta la documentacion general en [`docs/architecture.md`](../../docs/architecture.md).
