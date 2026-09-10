# NestJS DevTools for VS Code

The repository root contains a launch configuration for this extension. Press `F5` and choose **Run NestJS DevTools Extension**; VS Code will compile `apps/vscode-extension` and open an Extension Development Host.

Available commands:

- `NestJS DevTools: Start Server`
- `NestJS DevTools: Open Dashboard` opens the live dashboard inside VS Code
- `NestJS DevTools: View Requests`
- `NestJS DevTools: View Errors`
- `NestJS DevTools: View Database`
- `NestJS DevTools: Open Dashboard in Browser` (optional)
- `NestJS DevTools: Refresh Projects`
- `NestJS DevTools: Show Status`

The extension reads the configured DevTools server at `/api/state`. Configure `nestDevTools.serverUrl`, `nestDevTools.cliCommand`, or `nestDevTools.refreshInterval` in VS Code settings when needed.
