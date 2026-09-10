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
    dashboardPanel.webview.onDidReceiveMessage((message: { command?: string; section?: unknown }) => {
      if (message.command === 'refresh' && dashboardPanel) void updateDashboard(dashboardPanel, section);
      if (message.command === 'external') void openExternalDashboard();
      if (message.command === 'start') void startServer(provider);
      if (message.command === 'section' && dashboardPanel && isDashboardSection(message.section)) {
        void updateDashboard(dashboardPanel, message.section);
      }
    });
  }
  if (dashboardPanel) await updateDashboard(dashboardPanel, section);
}

async function updateDashboard(panel: vscode.WebviewPanel, section: DashboardSection): Promise<void> {
  const state = await fetchState();
  panel.webview.html = renderDashboard(state?.snapshot ?? undefined, section);
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

function isDashboardSection(value: unknown): value is DashboardSection {
  return value === 'overview' || value === 'requests' || value === 'errors' || value === 'database';
}

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
  const sections: Array<[DashboardSection, string]> = [['overview', 'Overview'], ['requests', 'Requests'], ['errors', 'Errors'], ['database', 'Database']];
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:28px clamp(18px,4vw,48px);max-width:1280px;margin:auto}.app{max-width:1120px;margin:auto}.header{display:flex;align-items:flex-end;gap:18px;padding:4px 0 22px;border-bottom:1px solid var(--vscode-panel-border)}.brand-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font-size:21px;font-weight:700}.eyebrow{margin:0 0 4px;color:var(--vscode-textLink-foreground);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}.header h1{margin:0;font-size:25px;letter-spacing:-.3px}.subtitle{margin:5px 0 0;color:var(--vscode-descriptionForeground);font-size:12px}.live{margin-left:auto;align-self:flex-start;display:flex;align-items:center;gap:7px;color:var(--vscode-testing-iconPassed);font-size:11px}.live:before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 4px color-mix(in srgb,currentColor 15%,transparent)}.toolbar{display:flex;align-items:center;gap:8px;padding:16px 0 20px}.nav{display:flex;gap:5px;flex:1}.nav button{color:var(--vscode-descriptionForeground);background:transparent;border:1px solid transparent;border-radius:6px;padding:7px 11px;font-size:12px}.nav button:hover,.nav button.active{color:var(--vscode-foreground);background:var(--vscode-list-hoverBackground);border-color:var(--vscode-panel-border)}button{font:inherit;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:5px;padding:7px 11px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}.secondary{color:var(--vscode-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-panel-border)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.cards div{position:relative;overflow:hidden;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px}.cards div:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--vscode-textLink-foreground)}.cards strong{display:block;font-size:26px;line-height:1.1;margin-bottom:7px}.cards span,li span,.muted{color:var(--vscode-descriptionForeground);font-size:12px}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:26px 0 9px}.section-heading h2,h2{margin:0;color:var(--vscode-foreground);font-size:13px;font-weight:600}.section-heading span{color:var(--vscode-descriptionForeground);font-size:11px}ul{list-style:none;padding:0;margin:0;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:0 14px}li{display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid var(--vscode-panel-border);padding:11px 2px}li:last-child{border-bottom:0}table{width:100%;border-collapse:separate;border-spacing:0;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:8px;overflow:hidden;font-size:12px}th,td{text-align:left;border-bottom:1px solid var(--vscode-panel-border);padding:11px 12px;vertical-align:top}th{color:var(--vscode-descriptionForeground);font-size:10px;text-transform:uppercase;letter-spacing:.8px;background:var(--vscode-sideBar-background)}tr:last-child td{border-bottom:0}td{word-break:break-word}.log{font-family:var(--vscode-editor-font-family);font-size:12px;padding:8px 0;margin:0;border-bottom:1px solid var(--vscode-panel-border)}.debug{color:#888}.info{color:#4fc1ff}.warn{color:#cca700}.error{color:#f14c4c}.empty{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:10px;padding:42px 28px}.empty h2{font-size:18px;margin-bottom:8px}.empty p{color:var(--vscode-descriptionForeground);margin:0 0 18px}.empty button{margin-right:8px}@media(max-width:650px){.header{align-items:flex-start}.live{display:none}.toolbar{align-items:flex-start;flex-wrap:wrap}.nav{flex-basis:100%;order:2;overflow:auto}.toolbar>.secondary{order:1}}
  </style></head><body><main class="app"><header class="header"><div class="brand-mark">N</div><div><p class="eyebrow">NestJS observability</p><h1>${escapeHtml(title)}</h1><p class="subtitle">Live application signals from your local DevTools server</p></div><div class="live">LIVE</div></header><div class="toolbar"><nav class="nav">${sections.map(([id, label]) => `<button class="${id === title.toLowerCase() ? 'active' : ''}" data-section="${id}">${label}</button>`).join('')}</nav><button class="secondary" data-command="refresh">↻ Refresh</button><button class="secondary" data-command="external">Open browser</button></div>${content}</main><script>const vscode=acquireVsCodeApi();document.querySelectorAll('[data-command]').forEach((button)=>button.addEventListener('click',()=>vscode.postMessage({command:button.dataset.command})));document.querySelectorAll('[data-section]').forEach((button)=>button.addEventListener('click',()=>vscode.postMessage({command:'section',section:button.dataset.section})));</script></body></html>`;
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
