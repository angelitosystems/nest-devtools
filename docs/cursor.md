# Cursor Integration

Cursor works exactly like VS Code — DevTools generates `cursor://` deep links so you can jump from a log or error to the exact line of code.

## How it works

Every log and error carries a **source location** (`file`, `line`, `column`). The dashboard renders an **Open in Cursor** link:

```
cursor://file/Users/me/apps/api/src/users.service.ts:87:21
```

Clicking it opens Cursor at that file, line and column.

## Requirements

- Cursor installed with its CLI (`cursor`) available in PATH.
- No extension required inside Cursor.

## First click

The first time you click a `cursor://` link, your OS or browser asks for permission to open the external application. Accept it once — subsequent clicks open directly.

## Deep links vs CLI launcher

| Method | How | Best for |
|---|---|---|
| `cursor://` deep links | Click in the dashboard | Jumping to a specific log/error line |
| `cursor` CLI (`cursor --goto file:line:col`) | Terminal | Scripted workflows |

Deep links are generated per platform at runtime — Windows, macOS and Linux paths are handled automatically (drive letters, separators and URI encoding included).

## Where the links appear

- **Logs** — next to each entry,
- **Errors** — group header and detail pane,
- **Requests** — timeline spans (v0.2).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Link does nothing | Allow the `cursor://` protocol when your browser asks |
| Wrong workspace window | Open the project once manually so Cursor remembers it |
| Line numbers off | Compiled code without source maps — see [VS Code page](./vscode.md#accurate-locations) |
