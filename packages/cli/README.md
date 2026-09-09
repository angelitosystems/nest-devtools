# @angelitosystems/nest-devtools-cli

> CLI, servidor local y dashboard para NestJS DevTools.

Este paquete incluye el ejecutable `nest-devtools`, el servidor HTTP/WebSocket y el dashboard estatico embebido. Se instala en la maquina de desarrollo, no dentro de cada aplicacion NestJS.

## Instalacion

Uso puntual con `npx`:

```bash
npx @angelitosystems/nest-devtools-cli
```

Instalacion global:

```bash
npm install --global @angelitosystems/nest-devtools-cli
```

```bash
bun add --global @angelitosystems/nest-devtools-cli
```

## Comandos

```text
nest-devtools                  Inicia el servidor y el dashboard
nest-devtools start            Inicia el servidor con opciones de red
nest-devtools status           Comprueba el endpoint HTTP
nest-devtools projects         Lista proyectos conocidos
nest-devtools logs             Muestra eventos de log recientes
nest-devtools doctor           Diagnostica runtime, HTTP y WebSocket
nest-devtools init             Conecta automaticamente el SDK en main.ts
nest-devtools --version        Muestra la version instalada
nest-devtools --help           Muestra la ayuda
```

Ejemplos:

```bash
nest-devtools start --port 4319 --ws-port 4320 --host localhost
nest-devtools status --port 4319
nest-devtools doctor --port 4319 --ws-port 4320
nest-devtools init
```

`nest-devtools init` modifica `src/main.ts` o `main.ts`, anade el import de `NestDevTools` y coloca `NestDevTools.init(app)` despues de `NestFactory.create(...)`. Es idempotente.

## Puertos

| Puerto | Uso |
|---:|---|
| `4317` | Dashboard HTTP y endpoint `/health` |
| `4318` | Conexiones WebSocket del SDK |

Abre el dashboard en `http://localhost:4317`. Si cambias el puerto WebSocket, configura el SDK con `NEST_DEVTOOLS_URL` o con la opcion `server` de `NestDevTools.init()`.

## API programatica

El paquete tambien exporta `DevToolsServer`, `DashboardStore`, `CLIRenderer`, `parseArgs`, `openInEditor` y `openTerminal` para integraciones internas y herramientas de desarrollo.

```ts
import { DevToolsServer } from '@angelitosystems/nest-devtools-cli';

const server = new DevToolsServer({
  httpPort: 4317,
  wsPort: 4318,
  host: 'localhost',
});

await server.start();
```

## Desarrollo

```bash
bun run --cwd apps/dashboard build
bun run scripts/prepare-publish.ts
bun run --cwd packages/cli build
bun test packages/cli
```

El dashboard debe copiarse a `packages/cli/public` antes de publicar. El proceso de release del monorepo realiza este paso automaticamente.

## Licencia

MIT. Consulta [`docs/cli.md`](../../docs/cli.md) para el uso detallado.
