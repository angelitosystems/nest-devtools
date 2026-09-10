"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_child_process_1 = require("node:child_process");
const node_http_1 = require("node:http");
const node_https_1 = require("node:https");
let serverProcess;
let refreshTimer;
let dashboardPanel;
let extensionRoot;
function activate(context) {
    extensionRoot = context.extensionUri;
    const provider = new ProjectsProvider();
    context.subscriptions.push(vscode.window.createTreeView('nestDevTools.projects', { treeDataProvider: provider }), vscode.commands.registerCommand('nestDevTools.startServer', () => startServer(provider)), vscode.commands.registerCommand('nestDevTools.openDashboard', () => openDashboard(provider, 'overview', 'react')), vscode.commands.registerCommand('nestDevTools.openRequests', () => openDashboard(provider, 'requests', 'native')), vscode.commands.registerCommand('nestDevTools.openErrors', () => openDashboard(provider, 'errors', 'native')), vscode.commands.registerCommand('nestDevTools.openDatabase', () => openDashboard(provider, 'database', 'native')), vscode.commands.registerCommand('nestDevTools.openExternal', () => openExternalDashboard()), vscode.commands.registerCommand('nestDevTools.refresh', () => provider.refresh()), vscode.commands.registerCommand('nestDevTools.showStatus', () => showStatus()));
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    status.command = 'nestDevTools.openDashboard';
    context.subscriptions.push(status);
    const updateStatus = async () => {
        const state = await fetchState();
        status.text = state?.snapshot ? `$(pulse) DevTools ${state.snapshot.projects.length}` : state?.ok ? '$(pulse) DevTools online' : '$(circle-slash) DevTools offline';
        status.tooltip = 'Open NestJS DevTools dashboard';
        status.show();
    };
    void updateStatus();
    refreshTimer = setInterval(() => {
        void updateStatus();
        provider.refresh();
    }, getConfig().refreshInterval);
}
function deactivate() {
    if (refreshTimer)
        clearInterval(refreshTimer);
    refreshTimer = undefined;
    if (serverProcess && !serverProcess.killed)
        serverProcess.kill();
    serverProcess = undefined;
}
async function startServer(provider) {
    if (serverProcess && !serverProcess.killed) {
        vscode.window.showInformationMessage('NestJS DevTools server is already running.');
        return;
    }
    const command = getConfig().cliCommand;
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    serverProcess = (0, node_child_process_1.spawn)(command, { cwd, shell: true, stdio: 'ignore', windowsHide: true });
    serverProcess.once('error', (error) => vscode.window.showErrorMessage(`Could not start DevTools: ${error.message}`));
    await new Promise((resolve) => setTimeout(resolve, 500));
    provider.refresh();
    await openDashboard(provider, 'overview', 'react');
}
async function openDashboard(provider, section = 'overview', mode = 'native') {
    if (mode === 'react') {
        if (dashboardPanel) {
            dashboardPanel.reveal(vscode.ViewColumn.One);
        }
        else {
            dashboardPanel = vscode.window.createWebviewPanel('nestDevTools.reactDashboard', 'NestJS DevTools Live', vscode.ViewColumn.One, { enableScripts: true });
            dashboardPanel.onDidDispose(() => { dashboardPanel = undefined; });
        }
        dashboardPanel.webview.html = renderReactDashboard(dashboardPanel.webview);
        return;
    }
    if (dashboardPanel) {
        dashboardPanel.reveal(vscode.ViewColumn.One);
        dashboardPanel.webview.html = renderDashboard(undefined, section, false);
    }
    else {
        dashboardPanel = vscode.window.createWebviewPanel('nestDevTools.dashboard', 'NestJS DevTools', vscode.ViewColumn.One, { enableScripts: true });
        dashboardPanel.onDidDispose(() => { dashboardPanel = undefined; });
        dashboardPanel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'refresh' && dashboardPanel)
                void updateDashboard(dashboardPanel, section);
            if (message.command === 'external')
                void openExternalDashboard();
            if (message.command === 'start')
                void startServer(provider);
            if (message.command === 'section' && dashboardPanel && isDashboardSection(message.section)) {
                void updateDashboard(dashboardPanel, message.section);
            }
        });
    }
    if (dashboardPanel)
        await updateDashboard(dashboardPanel, section);
}
function renderReactDashboard(webview) {
    const serverUrl = getConfig().serverUrl.replace(/\/$/, '');
    let origin = serverUrl;
    try {
        origin = new URL(serverUrl).origin;
    }
    catch { /* use configured URL */ }
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionRoot, 'media', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionRoot, 'media', 'webview.css'));
    return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; connect-src ${escapeHtml(origin)} ws: wss:;"><link rel="stylesheet" href="${styleUri}"></head><body data-server-url="${escapeHtml(serverUrl)}"><div id="root"></div><script src="${scriptUri}"></script></body></html>`;
}
async function updateDashboard(panel, section) {
    const state = await fetchState();
    panel.webview.html = renderDashboard(state?.snapshot ?? undefined, section, state?.ok === true);
}
async function openExternalDashboard() {
    await vscode.env.openExternal(vscode.Uri.parse(getConfig().serverUrl));
}
async function showStatus() {
    const state = await fetchState();
    if (!state?.snapshot) {
        vscode.window.showWarningMessage('NestJS DevTools server is offline.');
        return;
    }
    const snapshot = state.snapshot;
    vscode.window.showInformationMessage(`${snapshot.projects.length} project(s), ${snapshot.requests.length} request(s), ${snapshot.errors.length} error(s), ${snapshot.queries.length} database quer${snapshot.queries.length === 1 ? 'y' : 'ies'}.`);
}
class ProjectsProvider {
    changed = new vscode.EventEmitter();
    onDidChangeTreeData = this.changed.event;
    projects = [];
    refresh() {
        void fetchState().then((state) => {
            this.projects = state?.snapshot?.projects ?? [];
            this.changed.fire(undefined);
        });
    }
    getTreeItem(item) {
        return item;
    }
    getChildren() {
        return this.projects.map((project) => new ProjectItem(project));
    }
}
class ProjectItem extends vscode.TreeItem {
    constructor(project) {
        super(project.projectName, vscode.TreeItemCollapsibleState.None);
        this.description = `${project.environment} · ${project.hostname}`;
        this.tooltip = `${project.projectName}\n${project.projectId}\nPID ${project.pid}`;
        this.iconPath = new vscode.ThemeIcon('server-environment');
        this.command = { command: 'nestDevTools.openDashboard', title: 'Open Dashboard' };
    }
}
function isDashboardSection(value) {
    return value === 'overview' || value === 'requests' || value === 'errors' || value === 'database';
}
function renderDashboard(snapshot, section, serverReachable = false) {
    const title = section === 'overview' ? 'Overview' : section[0].toUpperCase() + section.slice(1);
    if (!snapshot) {
        return pageHtml(title, `<div class="empty"><h2>${serverReachable ? 'Server connected' : 'DevTools offline'}</h2><p>${serverReachable ? 'The server is responding, but its snapshot is unavailable. Restart nest-devtools to load the latest API.' : 'Start the local server or check the configured URL.'}</p><button data-command="refresh">Refresh</button><button data-command="start">Start server</button><button data-command="external">Open in browser</button></div>`, serverReachable);
    }
    const content = section === 'requests'
        ? table('Requests', ['Method', 'URL', 'Status', 'Duration'], snapshot.requests.slice(-30).reverse().map((item) => [item.method, item.url, String(item.statusCode), `${item.duration} ms`]))
        : section === 'errors'
            ? table('Errors', ['Name', 'Message', 'Project'], snapshot.errors.slice(-30).reverse().map((item) => [item.name, item.message, item.projectId]))
            : section === 'database'
                ? table('Database queries', ['Provider', 'SQL', 'Duration'], snapshot.queries.slice(-30).reverse().map((item) => [item.provider, item.sql, `${item.duration} ms`]))
                : `<div class="cards"><div><strong>${snapshot.projects.length}</strong><span>Projects</span><small class="metric-note">connected now</small></div><div><strong>${snapshot.requests.length}</strong><span>Requests</span><small class="metric-note">captured total</small></div><div><strong>${snapshot.logs.length}</strong><span>Logs</span><small class="metric-note">live events</small></div><div class="${snapshot.errors.length > 0 ? 'danger' : ''}"><strong>${snapshot.errors.length}</strong><span>Errors</span><small class="metric-note">needs attention</small></div><div><strong>${snapshot.queries.length}</strong><span>DB queries</span><small class="metric-note">instrumented</small></div></div>
          <div class="section-heading"><h2>Connected projects</h2><span>${snapshot.projects.length ? 'Healthy connections' : 'Waiting for SDK'}</span></div>${snapshot.projects.length === 0 ? '<div class="empty compact"><p class="muted">No projects connected yet.</p></div>' : `<ul>${snapshot.projects.map((project) => `<li><div class="project-name"><i></i><b>${escapeHtml(project.projectName)}</b></div><span>${escapeHtml(project.environment)} · PID ${project.pid}</span></li>`).join('')}</ul>`}
          <div class="section-heading"><h2>Recent activity</h2><span>Latest events</span></div><div class="activity-grid"><section class="feed"><div class="feed-title">Logs <b>${snapshot.logs.length}</b></div>${snapshot.logs.slice(-8).reverse().map((log) => `<p class="log"><b class="${log.level}">${escapeHtml(log.level)}</b><span>${escapeHtml(log.message)}</span></p>`).join('') || '<p class="muted">No logs captured.</p>'}</section><section class="feed"><div class="feed-title">Errors <b>${snapshot.errors.length}</b></div>${snapshot.errors.slice(-6).reverse().map((error) => `<p class="log"><b class="error">${escapeHtml(error.name)}</b><span>${escapeHtml(error.message)}</span></p>`).join('') || '<p class="muted">No errors captured.</p>'}</section></div>`;
    return pageHtml(title, content);
}
function pageHtml(title, content, serverReachable = true) {
    const sections = [['overview', 'Overview'], ['requests', 'Requests'], ['errors', 'Errors'], ['database', 'Database']];
    return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:28px clamp(18px,4vw,48px);max-width:1280px;margin:auto}.app{max-width:1120px;margin:auto}.header{display:flex;align-items:flex-end;gap:18px;padding:4px 0 22px;border-bottom:1px solid var(--vscode-panel-border)}.brand-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font-size:21px;font-weight:700}.eyebrow{margin:0 0 4px;color:var(--vscode-textLink-foreground);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}.header h1{margin:0;font-size:25px;letter-spacing:-.3px}.subtitle{margin:5px 0 0;color:var(--vscode-descriptionForeground);font-size:12px}.live{margin-left:auto;align-self:flex-start;display:flex;align-items:center;gap:7px;font-size:11px}.live:before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 4px var(--vscode-toolbar-hoverBackground)}.toolbar{display:flex;align-items:center;gap:8px;padding:16px 0 20px}.nav{display:flex;gap:5px;flex:1}.nav button{color:var(--vscode-descriptionForeground);background:transparent;border:1px solid transparent;border-radius:6px;padding:7px 11px;font-size:12px}.nav button:hover,.nav button.active{color:var(--vscode-foreground);background:var(--vscode-list-hoverBackground);border-color:var(--vscode-panel-border)}button{font:inherit;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:5px;padding:7px 11px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}.secondary{color:var(--vscode-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-panel-border)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.cards div{position:relative;overflow:hidden;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px}.cards div:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--vscode-textLink-foreground)}.cards div.danger:before{background:var(--vscode-testing-iconFailed)}.cards strong{display:block;font-size:26px;line-height:1.1;margin-bottom:7px}.cards span,li span,.muted{color:var(--vscode-descriptionForeground);font-size:12px}.metric-note{display:block;color:var(--vscode-descriptionForeground);font-size:10px;margin-top:8px}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:26px 0 9px}.section-heading h2,h2{margin:0;color:var(--vscode-foreground);font-size:13px;font-weight:600}.section-heading span{color:var(--vscode-descriptionForeground);font-size:11px}.activity-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.feed{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:0 14px}.feed-title{display:flex;justify-content:space-between;padding:12px 0 9px;color:var(--vscode-foreground);font-size:12px;font-weight:600;border-bottom:1px solid var(--vscode-panel-border)}.feed-title b{color:var(--vscode-descriptionForeground);font-size:11px;font-weight:400}.project-name{display:flex;align-items:center;gap:8px}.project-name i{width:7px;height:7px;border-radius:50%;background:var(--vscode-testing-iconPassed);box-shadow:0 0 0 3px var(--vscode-toolbar-hoverBackground)}ul{list-style:none;padding:0;margin:0;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:0 14px}li{display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid var(--vscode-panel-border);padding:11px 2px}li:last-child{border-bottom:0}table{width:100%;border-collapse:separate;border-spacing:0;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:8px;overflow:hidden;font-size:12px}th,td{text-align:left;border-bottom:1px solid var(--vscode-panel-border);padding:11px 12px;vertical-align:top}th{color:var(--vscode-descriptionForeground);font-size:10px;text-transform:uppercase;letter-spacing:.8px;background:var(--vscode-sideBar-background)}tr:last-child td{border-bottom:0}td{word-break:break-word}.log{display:flex;gap:10px;font-family:var(--vscode-editor-font-family);font-size:12px;padding:8px 0;margin:0;border-bottom:1px solid var(--vscode-panel-border)}.log:last-child{border-bottom:0}.log b{min-width:48px;font-size:10px;text-transform:uppercase}.debug{color:#888}.info{color:#4fc1ff}.warn{color:#cca700}.error{color:#f14c4c}.empty{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:10px;padding:42px 28px}.empty.compact{padding:20px}.empty h2{font-size:18px;margin-bottom:8px}.empty p{color:var(--vscode-descriptionForeground);margin:0 0 18px}.empty button{margin-right:8px}@media(max-width:650px){.header{align-items:flex-start}.live{display:none}.toolbar{align-items:flex-start;flex-wrap:wrap}.nav{flex-basis:100%;order:2;overflow:auto}.toolbar>.secondary{order:1}.activity-grid{grid-template-columns:1fr}}
  </style></head><body><main class="app"><header class="header"><div class="brand-mark">N</div><div><p class="eyebrow">NestJS observability</p><h1>${escapeHtml(title)}</h1><p class="subtitle">Live application signals from your local DevTools server</p></div><div class="live" style="color:${serverReachable ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)'}">${serverReachable ? 'LIVE' : 'OFFLINE'}</div></header><div class="toolbar"><nav class="nav">${sections.map(([id, label]) => `<button class="${id === title.toLowerCase() ? 'active' : ''}" data-section="${id}">${label}</button>`).join('')}</nav><button class="secondary" data-command="refresh">↻ Refresh</button><button class="secondary" data-command="external">Open browser</button></div>${content}</main><script>const vscode=acquireVsCodeApi();document.querySelectorAll('[data-command]').forEach((button)=>button.addEventListener('click',()=>vscode.postMessage({command:button.dataset.command})));document.querySelectorAll('[data-section]').forEach((button)=>button.addEventListener('click',()=>vscode.postMessage({command:'section',section:button.dataset.section})));</script></body></html>`;
}
function table(title, headers, rows) {
    return `<h2>${escapeHtml(title)}</h2>${rows.length === 0 ? '<p class="muted">Nothing captured yet.</p>' : `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}`;
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
function getConfig() {
    const config = vscode.workspace.getConfiguration('nestDevTools');
    return {
        serverUrl: config.get('serverUrl', 'http://localhost:4317'),
        cliCommand: config.get('cliCommand', 'npx nest-devtools start'),
        refreshInterval: Math.max(1000, config.get('refreshInterval', 5000)),
    };
}
function fetchState() {
    return new Promise((resolve) => {
        try {
            const target = new URL(`${getConfig().serverUrl.replace(/\/$/, '')}/api/state`);
            const request = (target.protocol === 'https:' ? node_https_1.request : node_http_1.request)(target, { timeout: 1500 }, (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => { body += chunk; });
                response.on('end', () => {
                    try {
                        resolve(response.statusCode === 200 ? JSON.parse(body) : undefined);
                    }
                    catch {
                        resolve(undefined);
                    }
                });
            });
            request.on('error', () => resolve(undefined));
            request.end();
        }
        catch {
            resolve(undefined);
        }
    });
}
//# sourceMappingURL=extension.js.map