# Publicar en npm

Esta guía describe la primera publicación manual de NestJS DevTools y la transición posterior a GitHub Actions.

## Paquetes que se publican

La publicación inicial crea estos cuatro paquetes públicos, todos con la misma versión (`0.1.0` en el estado actual):

| Orden | Paquete | Carpeta |
|---:|---|---|
| 1 | `@angelitosystems/devtools-protocol` | `packages/protocol` |
| 2 | `@angelitosystems/devtools-core` | `packages/core` |
| 3 | `@angelitosystems/nest-devtools` | `packages/nestjs` |
| 4 | `@angelitosystems/nest-devtools-cli` | `packages/cli` |

El dashboard (`apps/dashboard`) es privado y se copia dentro del paquete CLI antes de publicarlo.

## Requisitos

- Tener una cuenta npm con permiso para publicar bajo el scope `@angelitosystems`.
- Tener instalado Node.js 18 o superior, npm y Bun 1.1 o superior.
- Trabajar desde la raíz del repositorio.
- No haber publicado previamente ninguna de las versiones que se van a usar. npm no permite volver a publicar la misma combinación de nombre y versión.

Comprueba las herramientas y la sesión:

```powershell
node --version
npm --version
bun --version
npm whoami
npm config get registry
```

El registro debe ser `https://registry.npmjs.org/`. Si `npm whoami` falla, autentícate primero:

```powershell
npm login
npm whoami
```

## Primera publicación manual

### 1. Revisa la versión

Actualiza la versión en los cuatro `package.json` si corresponde. Las cuatro versiones deben ser idénticas:

```powershell
Get-ChildItem packages/*/package.json | ForEach-Object {
  $manifest = Get-Content $_.FullName -Raw | ConvertFrom-Json
  "$($manifest.name)@$($manifest.version)"
}
```

Para un nuevo release, cambia la versión antes de construir. Por ejemplo, todos los paquetes deben pasar de `0.1.0` a `0.1.1`.

### 2. Instala y valida el monorepo

```powershell
bun install --frozen-lockfile
bun run typecheck
bun run build
bun test packages
bun run e2e
```

### 3. Construye el dashboard incluido en el CLI

```powershell
bun run --cwd apps/dashboard build
bun run scripts/prepare-publish.ts
```

El segundo comando reemplaza `packages/cli/public` con `apps/dashboard/dist`. No lo omitas: el paquete CLI publicado necesita esos archivos para servir el dashboard.

### 4. Configura el token de npm para el script

En una terminal interactiva, el script pregunta por el token y lo usa mediante un archivo `.npmrc` temporal que se elimina al terminar:

```powershell
bun run scripts/publish.ts
# npm token: (la entrada no se muestra)
```

También puedes proporcionar el token mediante `NPM_TOKEN` cuando ejecutes el script desde CI. Crea un token de npm con permiso de lectura y escritura de paquetes. Para una ejecución manual con PowerShell:

```powershell
$env:NPM_TOKEN = "<pega-aqui-tu-token>"
"//registry.npmjs.org/:_authToken=$env:NPM_TOKEN" | Set-Content "$HOME\.npmrc"
npm whoami
```

Si la cuenta tiene activada la verificación en dos pasos para publicar, el script pregunta después por el código OTP. La entrada tampoco se muestra y puedes pulsar Enter si no es necesario:

```powershell
bun run scripts/publish.ts
# npm OTP (press Enter if not required): (la entrada no se muestra)
```

También puedes definir `NPM_OTP` para una ejecución no interactiva. El script pasa ese valor a `npm publish` en cada paquete. Si el código caduca durante una publicación, asígnalo de nuevo y repite el proceso; el script comprobará qué versiones ya existen antes de continuar.

No guardes el token en el repositorio ni lo introduzcas en el workflow como texto plano. Al terminar, puedes limpiar la variable de la sesión:

```powershell
Remove-Item Env:NPM_TOKEN
Remove-Item Env:NPM_OTP -ErrorAction SilentlyContinue
```

### 5. Publica usando el flujo del repositorio

```powershell
bun run scripts/publish.ts
```

`scripts/publish.ts` hace estas comprobaciones y operaciones:

1. Comprueba que `NPM_TOKEN` exista.
2. Lee las versiones y detiene el proceso si no son iguales.
3. Comprueba en npm que cada combinación paquete/versión aún no exista.
4. Publica en orden de dependencias.
5. Sustituye temporalmente `workspace:*` y `workspace:^` por versiones npm (`^0.1.0`) y restaura los `package.json` aunque una publicación falle.

Si una publicación intermedia falla, no repitas ciegamente todo el comando: revisa qué paquete ya apareció en npm. Las versiones ya publicadas no se pueden reutilizar; incrementa la versión de todos los paquetes para el siguiente intento o publica únicamente lo que falte con extremo cuidado.

### 6. Verifica la instalación desde npm

```powershell
npm view @angelitosystems/devtools-protocol@0.1.0 version
npm view @angelitosystems/devtools-core@0.1.0 version
npm view @angelitosystems/nest-devtools@0.1.0 version
npm view @angelitosystems/nest-devtools-cli@0.1.0 version
npx @angelitosystems/nest-devtools-cli@0.1.0 --version
```

Prueba también la instalación del SDK en un proyecto NestJS limpio. El objetivo es comprobar que las dependencias internas ya no aparecen como `workspace:*` y que el CLI contiene el dashboard.

## Publicaciones siguientes con GitHub Actions

El workflow [.github/workflows/release.yml](../.github/workflows/release.yml) ejecuta validaciones, construye los paquetes, prepara el dashboard y llama al mismo `scripts/publish.ts`.

Antes de usarlo:

1. Configura el secreto `NPM_TOKEN` en **Settings > Secrets and variables > Actions** del repositorio.
2. Asegúrate de que el token pueda publicar el scope `@angelitosystems`.
3. Incrementa la misma versión en los cuatro paquetes y actualiza `bun.lock` si cambia.
4. Confirma los cambios y crea un tag con formato `vX.Y.Z`, por ejemplo:

```powershell
git tag v0.1.1
git push origin v0.1.1
```

El push del tag activa el workflow. También existe `workflow_dispatch`, pero debe ejecutarse únicamente cuando esa versión todavía no esté publicada: el script aborta si encuentra algún paquete con la misma versión.

## Fallos frecuentes

| Mensaje o síntoma | Causa habitual | Acción |
|---|---|---|
| `npm token ... requires an interactive terminal` | El script intenta preguntar desde un proceso sin TTY | Define `NPM_TOKEN` y, si aplica, `NPM_OTP` |
| `EOTP` / `requires a one-time password` | La cuenta exige 2FA para publicar | Define `NPM_OTP` con el código actual; en Actions usa un token de automatización |
| `versions out of sync` | Los cuatro paquetes tienen versiones diferentes | Iguala sus versiones |
| `already published` | Esa versión ya existe en npm | Usa una nueva versión o corrige el release parcial |
| El CLI no muestra el dashboard | No se ejecutó `prepare-publish.ts` | Construye `apps/dashboard` y vuelve a preparar el paquete |
| `npm whoami` falla | Token ausente, inválido o registro incorrecto | Revisa `.npmrc`, permisos y `npm config get registry` |
