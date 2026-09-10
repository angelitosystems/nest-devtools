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
- Configurar Trusted Publishing para cada paquete en npm, usando GitHub Actions como proveedor.
- Tener instalado Node.js 18 o superior, npm y Bun 1.1 o superior.
- Trabajar desde la raíz del repositorio.
- No haber publicado previamente ninguna de las versiones que se van a usar. npm no permite volver a publicar la misma combinación de nombre y versión.

Comprueba las herramientas:

```powershell
node --version
npm --version
bun --version
npm config get registry
```

El registro debe ser `https://registry.npmjs.org/`.

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

### 4. Configura npm Trusted Publishing

En npm, abre cada paquete y configura un publicador confiable en **Package settings > Trusted Publisher**:

- Proveedor: **GitHub Actions**.
- Repositorio: el repositorio GitHub que contiene este proyecto.
- Workflow: `.github/workflows/release.yml`.
- Entorno: déjalo vacío, salvo que el repositorio use un entorno de GitHub para publicar.

Repite la configuración para los cuatro paquetes. Si también vas a ejecutar el workflow manual `publish.yml`, añade ese workflow como segundo publicador confiable en cada paquete. No hace falta crear `NPM_TOKEN` ni escribir credenciales en `.npmrc`.

### 5. Publica usando el flujo del repositorio

```powershell
bun run scripts/publish.ts
```

`scripts/publish.ts` hace estas comprobaciones y operaciones:

1. Lee las versiones y detiene el proceso si no son iguales.
2. Comprueba en npm que cada combinación paquete/versión aún no exista.
3. Publica en orden de dependencias usando Trusted Publishing y provenance.
4. Sustituye temporalmente `workspace:*` y `workspace:^` por versiones npm (`^0.1.0`) y restaura los `package.json` aunque una publicación falle.

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

1. Configura Trusted Publishing en npm para los cuatro paquetes y el workflow que vaya a ejecutarse.
2. Incrementa la misma versión en los cuatro paquetes y actualiza `bun.lock` si cambia.
3. Confirma los cambios y crea un tag con formato `vX.Y.Z`, por ejemplo:

```powershell
git tag v0.1.1
git push origin v0.1.1
```

El push del tag activa el workflow. También existe `workflow_dispatch`, pero debe ejecutarse únicamente cuando esa versión todavía no esté publicada: el script aborta si encuentra algún paquete con la misma versión.

## Fallos frecuentes

| Mensaje o síntoma | Causa habitual | Acción |
|---|---|---|
| Error de Trusted Publishing / OIDC | El workflow o el repositorio no coinciden con la configuración del paquete en npm | Revisa el proveedor, repositorio y nombre exacto del workflow en **Package settings > Trusted Publisher** |
| `versions out of sync` | Los cuatro paquetes tienen versiones diferentes | Iguala sus versiones |
| `already published` | Esa versión ya existe en npm | Usa una nueva versión o corrige el release parcial |
| El CLI no muestra el dashboard | No se ejecutó `prepare-publish.ts` | Construye `apps/dashboard` y vuelve a preparar el paquete |
| El registro no coincide | npm apunta a un registro distinto | Revisa `npm config get registry` |
