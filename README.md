# Routes explorer + real metadata fix — files to apply

Copy each file into your `nest-devtools` fork at the SAME path (paths below
mirror the monorepo structure):

- packages/protocol/src/types.ts        → replace the whole file
- packages/nestjs/src/instrumentation/app-explorer.ts → replace the whole file
- apps/dashboard/src/pages/Routes.tsx    → new file
- apps/dashboard/src/App.tsx             → replace the whole file (adds the
  "Routes" nav item and wires the new page in)

After copying:
1. Bump the version in packages/protocol/package.json and
   packages/nestjs/package.json.
2. Rebuild both packages (and apps/dashboard).
3. Relink/reinstall @angelitosystems/nest-devtools in your dental-clinic API.
4. Don't forget the earlier fix in your PrismaService constructor:
     log: [{ emit: 'event', level: 'query' }]
   — that one is what makes the Database tab start capturing queries; it's
   a separate file (your own prisma.service.ts), not included here.

Notes on the DTO shape feature: it reads class-validator's metadata storage
from the HOST app's node_modules at runtime (via createRequire), so it needs
zero extra dependency in nest-devtools itself. If class-validator isn't
resolvable, the DTO name still shows, just with an empty field table.
