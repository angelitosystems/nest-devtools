import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { ProjectInfo, StateSnapshot } from '@angelitosystems/devtools-protocol' with { 'resolution-mode': 'import' };

type StateResponse = { ok: boolean; snapshot: StateSnapshot | null };

let serverProcess: ChildProcess | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let dashboardPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ProjectsProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('nestDevTools.projects', { treeDataProvider: provider }),
    vscode.commands.registerCommand('nestDevTools.startServer', () => startServer(provider)),
    vscode.commands.registerCommand('nestDevTools.openDashboard', () => openDashboard(provider)),
    vscode.commands.registerCommand('nestDevTools.openRequests', () => openDashboard(provider, 'requests')),
    vscode.commands.registerCommand('nestDevTools.openErrors', () => openDashboard(provider, 'errors')),
    vscode.commands.registerCommand('nestDevTools.openDatabase', () => openDashboard(provider, 'database')),
    vscode.commands.registerCommand('nestDevTools.openExternal', () => openExternalDashboard()),
    vscode.commands.registerCommand('nestDevTools.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('nestDevTools.showStatus', () => showStatus()),
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  status.command = 'nestDevTools.openDashboard';
  context.subscriptions.push(status);
  const updateStatus = async () => {
    const state = await fetchState();
    status.text = state?.snapshot ? `$(pulse) DevTools ${state.snapshot.projects.length}` : '$(circle-slash) DevTools offline';
    status.tooltip = 'Open NestJS DevTools dashboard';
    status.show();
  };
  void updateStatus();
  refreshTimer = setInterval(() => {
    void updateStatus();
    provider.refresh();
  }, getConfig().refreshInterval);
}

export function deactivate(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = undefined;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  serverProcess = undefined;
}

async function startServer(provider: ProjectsProvider): Promise<void> {
  if (serverProcess && !serverProcess.killed) {
    vscode.window.showInformationMessage('NestJS DevTools server is already running.');
    return;
  }
  const command = getConfig().cliCommand;
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  serverProcess = spawn(command, { cwd, shell: true, stdio: 'ignore', windowsHide: true });
  serverProcess.once('error', (error) => vscode.window.showErrorMessage(`Could not start DevTools: ${error.message}`));
  await new Promise((resolve) => setTimeout(resolve, 500));
  provider.refresh();
  await openDashboard(provider);
}

async function openDashboard(provider: ProjectsProvider, section: DashboardSection = 'overview'): Promise<void> {
  if (dashboardPanel) {
    dashboardPanel.reveal(vscode.ViewColumn.One);
    dashboardPanel.webview.html = renderDashboard(undefined, section);
  } else {
    dashboardPanel = vscode.window.createWebviewPanel(
      'nestDevTools.dashboard',
      'NestJS DevTools',
      vscode.ViewColumn.One,
      { enableScripts: true },
    );
    dashboardPanel.onDidDispose(() => { dashboardPanel = undefined; });
    dashboardPanel.webview.onDidReceiveMessage((message: { command?: string }) => {
      if (message.command === 'refresh' && dashboardPanel) void updateDashboard(dashboardPanel, section);
      if (message.command === 'external') void openExternalDashboard();
      if (message.command === 'start') void startServer(provider);
    });
  }
  if (dashboardPanel) await updateDashboard(dashboardPanel, section);
}

async function updateDashboard(panel: vscode.WebviewPanel, section: DashboardSection): Promise<void> {
  const state = await fetchState();
  panel.webview.html = renderDashboard(state?.snapshot, section);
}

async function openExternalDashboard(): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(getConfig().serverUrl));
}

async function showStatus(): Promise<void> {
  const state = await fetchState();
  if (!state?.snapshot) {
    vscode.window.showWarningMessage('NestJS DevTools server is offline.');
    return;
  }
  const snapshot = state.snapshot;
  vscode.window.showInformationMessage(
    `${snapshot.projects.length} project(s), ${snapshot.requests.length} request(s), ${snapshot.errors.length} error(s), ${snapshot.queries.length} database quer${snapshot.queries.length === 1 ? 'y' : 'ies'}.`,
  );
}

class ProjectsProvider implements vscode.TreeDataProvider<ProjectItem> {
  private readonly changed = new vscode.EventEmitter<ProjectItem | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private projects: ProjectInfo[] = [];

  refresh(): void {
    void fetchState().then((state) => {
      this.projects = state?.snapshot?.projects ?? [];
      this.changed.fire(undefined);
    });
  }

  getTreeItem(item: ProjectItem): vscode.TreeItem {
    return item;
  }

  getChildren(): ProjectItem[] {
    return this.projects.map((project) => new ProjectItem(project));
  }
}

class ProjectItem extends vscode.TreeItem {
  constructor(project: ProjectInfo) {
    super(project.projectName, vscode.TreeItemCollapsibleState.None);
    this.description = `${project.environment} · ${project.hostname}`;
    this.tooltip = `${project.projectName}\n${project.projectId}\nPID ${project.pid}`;
    this.iconPath = new vscode.ThemeIcon('server-environment');
    this.command = { command: 'nestDevTools.openDashboard', title: 'Open Dashboard' };
  }
}

type DashboardSection = 'overview' | 'requests' | 'errors' | 'database';

function renderDashboard(snapshot: StateSnapshot | undefined, section: DashboardSection): string {
  const title = section === 'overview' ? 'Overview' : section[0].toUpperCase() + section.slice(1);
  if (!snapshot) {
    return pageHtml(title, `<div class="empty"><h2>DevTools offline</h2><p>Start the local server or check the configured URL.</p><button data-command="start">Start server</button><button data-command="external">Open in browser</button></div>`);
  }

  const content = section === 'requests'
    ? table('Requests', ['Method', 'URL', 'Status', 'Duration'], snapshot.requests.slice(-30).reverse().map((item) => [item.method, item.url, String(item.statusCode), `${item.duration} ms`]))
    : section === 'errors'
      ? table('Errors', ['Name', 'Message', 'Project'], snapshot.errors.slice(-30).reverse().map((item) => [item.name, item.message, item.projectId]))
      : section === 'database'
        ? table('Database queries', ['Provider', 'SQL', 'Duration'], snapshot.queries.slice(-30).reverse().map((item) => [item.provider, item.sql, `${item.duration} ms`]))
        : `<div class="cards"><div><strong>${snapshot.projects.length}</strong><span>Projects</span></div><div><strong>${snapshot.requests.length}</strong><span>Requests</span></div><div><strong>${snapshot.logs.length}</strong><span>Logs</span></div><div><strong>${snapshot.errors.length}</strong><span>Errors</span></div><div><strong>${snapshot.queries.length}</strong><span>DB queries</span></div></div>
          <h2>Connected projects</h2>${snapshot.projects.length === 0 ? '<p class="muted">No projects connected.</p>' : `<ul>${snapshot.projects.map((project) => `<li><b>${escapeHtml(project.projectName)}</b><span>${escapeHtml(project.environment)} · PID ${project.pid}</span></li>`).join('')}</ul>`}
          <h2>Recent logs</h2>${snapshot.logs.slice(-12).reverse().map((log) => `<p class="log"><b class="${log.level}">${escapeHtml(log.level)}</b> ${escapeHtml(log.message)}</p>`).join('') || '<p class="muted">No logs captured.</p>'}`;

  return pageHtml(title, content);
}

function pageHtml(title: string, content: string): string {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;max-width:1100px;margin:auto}h1{font-size:22px;margin:0 0 16px}h2{font-size:14px;margin:24px 0 8px;color:var(--vscode-descriptionForeground)}.toolbar{display:flex;gap:8px;margin-bottom:18px}button{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:6px 10px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.cards div{border:1px solid var(--vscode-panel-border);padding:12px}.cards strong{display:block;font-size:24px}.cards span,li span,.muted{color:var(--vscode-descriptionForeground);font-size:12px}ul{list-style:none;padding:0;margin:0}li{display:flex;justify-content:space-between;border-bottom:1px solid var(--vscode-panel-border);padding:9px 0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;border-bottom:1px solid var(--vscode-panel-border);padding:8px;vertical-align:top}th{color:var(--vscode-descriptionForeground)}td{word-break:break-word}.log{font-family:var(--vscode-editor-font-family);font-size:12px}.debug{color:#888}.info{color:#4fc1ff}.warn{color:#cca700}.error{color:#f14c4c}.empty{padding:35px 0}.empty button{margin-right:8px}
  </style></head><body><div class="toolbar"><h1>${escapeHtml(title)}</h1><span style="flex:1"></span><button data-command="refresh">Refresh</button><button data-command="external">Open browser</button></div>${content}<script>const vscode=acquireVsCodeApi();document.querySelectorAll('[data-command]').forEach((button)=>button.addEventListener('click',()=>vscode.postMessage({command:button.dataset.command})));</script></body></html>`;
}

function table(title: string, headers: string[], rows: string[][]): string {
  return `<h2>${escapeHtml(title)}</h2>${rows.length === 0 ? '<p class="muted">Nothing captured yet.</p>' : `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function getConfig(): { serverUrl: string; cliCommand: string; refreshInterval: number } {
  const config = vscode.workspace.getConfiguration('nestDevTools');
  return {
    serverUrl: config.get('serverUrl', 'http://localhost:4317'),
    cliCommand: config.get('cliCommand', 'npx nest-devtools start'),
    refreshInterval: Math.max(1000, config.get('refreshInterval', 5000)),
  };
}

function fetchState(): Promise<StateResponse | undefined> {
  return new Promise((resolve) => {
    try {
      const target = new URL(`${getConfig().serverUrl.replace(/\/$/, '')}/api/state`);
      const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { timeout: 1500 }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          try { resolve(response.statusCode === 200 ? JSON.parse(body) as StateResponse : undefined); } catch { resolve(undefined); }
        });
      });
      request.on('error', () => resolve(undefined));
      request.end();
    } catch {
      resolve(undefined);
    }
  });
}
