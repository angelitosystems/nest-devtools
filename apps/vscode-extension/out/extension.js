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
function activate(context) {
    const provider = new ProjectsProvider();
    context.subscriptions.push(vscode.window.createTreeView('nestDevTools.projects', { treeDataProvider: provider }), vscode.commands.registerCommand('nestDevTools.startServer', () => startServer(provider)), vscode.commands.registerCommand('nestDevTools.openDashboard', () => openDashboard(provider)), vscode.commands.registerCommand('nestDevTools.openRequests', () => openDashboard(provider, 'requests')), vscode.commands.registerCommand('nestDevTools.openErrors', () => openDashboard(provider, 'errors')), vscode.commands.registerCommand('nestDevTools.openDatabase', () => openDashboard(provider, 'database')), vscode.commands.registerCommand('nestDevTools.openExternal', () => openExternalDashboard()), vscode.commands.registerCommand('nestDevTools.refresh', () => provider.refresh()), vscode.commands.registerCommand('nestDevTools.showStatus', () => showStatus()));
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
    await openDashboard(provider);
}
async function openDashboard(provider, section = 'overview') {
    if (dashboardPanel) {
        dashboardPanel.reveal(vscode.ViewColumn.One);
        dashboardPanel.webview.html = renderDashboard(undefined, section);
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
        });
    }
    if (dashboardPanel)
        await updateDashboard(dashboardPanel, section);
}
async function updateDashboard(panel, section) {
    const state = await fetchState();
    panel.webview.html = renderDashboard(state?.snapshot, section);
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