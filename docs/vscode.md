# VS Code Integration

Jump from a log or error in the dashboard straight to the exact line of code in VS Code.

## How it works

Every log and error carries a **source location** (`file`, `line`, `column`) resolved from the stack at capture time. Wherever you see a location in the dashboard, you get an **Open in VS Code** link built as a deep link:

```
vscode://file/Users/me/apps/api/src/users.service.ts:87:21
```

Clicking it asks your OS to open VS Code at that file, line and column.

## Requirements

- VS Code installed with the `code` CLI available in PATH (the installer does this by default on Windows/macOS; on Linux choose "Add to PATH" during install).
- Nothing to install *inside* VS Code — no extension needed for deep links.

## Accurate locations

Source locations are exact when your running code matches your source:

| Setup | Accuracy |
|---|---|
| `bun run src/main.ts` (Bun) | ✅ exact |
| `ts-node` / `tsx` dev runners | ✅ exact |
| Compiled `dist/` with `sourceMap: true` | ✅ exact (stack frames resolve to `src/`) |
| Compiled without source maps | ⚠️ points at `dist/*.js` |

For compiled setups make sure `tsconfig.json` has `"sourceMap": true` and `source-map-support` is registered (NestJS projects bootstrap it by default in development).

## Where the links appear

- **Logs** — next to each entry (`users.service.ts:42`),
- **Errors** — in the group header and detail pane,
- **Requests** — in the timeline spans (v0.2).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Link does nothing | OS blocked the protocol prompt — allow `vscode://` for your browser |
| Opens the wrong project | The absolute path belongs to another workspace window; open it once manually |
| Line numbers look wrong | Running compiled code without source maps — see table above |

If you use Cursor instead, see [Cursor Integration](./cursor.md).
