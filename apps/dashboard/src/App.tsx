import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  Database,
  Gauge,
  LayoutDashboard,
  ListTree,
  Radio,
  Route,
  ScrollText,
  Trash2,
  Zap,
} from 'lucide-react';
import { useDevToolsStore } from './store/store';
import { cn } from './lib/utils';
import OverviewPage from './pages/Overview';
import RequestsPage from './pages/Requests';
import LogsPage from './pages/Logs';
import ErrorsPage from './pages/Errors';
import PerformancePage from './pages/Performance';
import ApplicationPage from './pages/Application';
import RoutesPage from './pages/Routes';
import DatabasePage from './pages/Database';
import WebSocketsPage from './pages/WebSockets';

type PageId =
  | 'overview'
  | 'requests'
  | 'logs'
  | 'errors'
  | 'database'
  | 'websockets'
  | 'performance'
  | 'modules'
  | 'controllers'
  | 'providers'
  | 'routes';

interface NavItem {
  id: PageId;
  label: string;
  icon: typeof Activity;
}

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: '',
    items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    section: 'Observability',
    items: [
      { id: 'requests', label: 'Requests', icon: Radio },
      { id: 'logs', label: 'Logs', icon: ScrollText },
      { id: 'errors', label: 'Errors', icon: AlertTriangle },
      { id: 'performance', label: 'Performance', icon: Gauge },
      { id: 'database', label: 'Database', icon: Database },
      { id: 'websockets', label: 'WebSockets', icon: Activity },
    ],
  },
  {
    section: 'Application',
    items: [
      { id: 'routes', label: 'Routes', icon: Route },
      { id: 'modules', label: 'Modules', icon: Boxes },
      { id: 'controllers', label: 'Controllers', icon: ListTree },
      { id: 'providers', label: 'Providers', icon: Zap },
    ],
  },
];

export default function App() {
  const store = useDevToolsStore();
  const [page, setPage] = useState<PageId>('overview');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [collapsed, setCollapsed] = useState(false);

  const filtered = useMemo(() => {
    const byProject = <T extends { projectId: string }>(items: T[]): T[] =>
      projectFilter === 'all' ? items : items.filter((item) => item.projectId === projectFilter);
    return {
      ...store,
      requests: byProject(store.requests),
      logs: byProject(store.logs),
      errors: byProject(store.errors),
      queries: byProject(store.queries),
      websocketConnections: byProject(store.websocketConnections),
      websocketMessages: byProject(store.websocketMessages),
    };
  }, [store, projectFilter]);

  const clearScopeForPage: Record<PageId, 'logs' | 'requests' | 'errors' | 'queries' | 'all'> = {
    overview: 'all',
    requests: 'requests',
    logs: 'logs',
    errors: 'errors',
    database: 'queries',
    websockets: 'all',
    performance: 'all',
    modules: 'all',
    controllers: 'all',
    providers: 'all',
    routes: 'all',
  };

  return (
    <div className="flex h-full">
      <Sidebar page={page} onNavigate={setPage} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar
          state={store.connectionState}
          projects={store.projects}
          selected={projectFilter}
          onSelect={setProjectFilter}
          onClear={() => filtered.clear(clearScopeForPage[page])}
        />
        <main className="flex-1 overflow-auto p-4 min-w-0">
          {page === 'overview' && <OverviewPage store={filtered} onNavigate={setPage} />}
          {page === 'requests' && <RequestsPage store={filtered} />}
          {page === 'logs' && <LogsPage store={filtered} />}
          {page === 'errors' && <ErrorsPage store={filtered} />}
          {page === 'performance' && <PerformancePage store={filtered} />}
          {page === 'database' && <DatabasePage store={filtered} />}
          {page === 'websockets' && <WebSocketsPage store={filtered} />}
          {page === 'routes' && <RoutesPage store={filtered} />}
          {(page === 'modules' || page === 'controllers' || page === 'providers') && (
            <ApplicationPage store={filtered} focus={page} />
          )}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  page,
  onNavigate,
  collapsed,
  onToggle,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        'shrink-0 border-r border-surface-700 bg-surface-900 flex flex-col transition-[width] duration-150',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-surface-700">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent-500/15 text-accent-400 font-mono text-xs font-bold">
          N
        </span>
        {!collapsed && <span className="font-semibold tracking-tight text-sm truncate">NestJS DevTools</span>}
      </div>
      <nav className="flex-1 overflow-auto py-2">
        {NAV.map((group) => (
          <div key={group.section} className="mb-2">
            {group.section && !collapsed && (
              <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-slate-600">{group.section}</div>
            )}
            {group.items.map((item) => (
              <button
                key={item.id}
                title={collapsed ? item.label : undefined}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'group relative w-full flex items-center gap-2.5 px-4 py-1.5 text-[13px] text-left transition-colors',
                  page === item.id ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100 hover:bg-surface-800',
                )}
              >
                <span
                  className={cn(
                    'absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-accent-500 transition-opacity',
                    page === item.id ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <item.icon className={cn('h-4 w-4 shrink-0', page === item.id && 'text-accent-400')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-4 py-3 text-[11px] text-slate-600 border-t border-surface-700 hover:text-slate-300 hover:bg-surface-800"
      >
        {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        {!collapsed && <span>Collapse · v0.1.0</span>}
      </button>
    </aside>
  );
}

function Topbar({
  state,
  projects,
  selected,
  onSelect,
  onClear,
}: {
  state: 'connecting' | 'open' | 'closed';
  projects: Array<{ projectId: string; projectName: string }>;
  selected: string;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const dot = state === 'open' ? 'bg-emerald-400' : state === 'connecting' ? 'bg-amber-400' : 'bg-rose-500';
  const label = state === 'open' ? 'Online' : state === 'connecting' ? 'Connecting…' : 'Offline';
  return (
    <header className="h-14 shrink-0 border-b border-surface-700 bg-surface-900 flex items-center gap-3 px-4">
      <div className="flex items-center gap-2 rounded-full border border-surface-600 bg-surface-850 pl-2.5 pr-3 py-1">
        <span className={cn('h-2 w-2 rounded-full', dot, state === 'connecting' && 'animate-pulse')} />
        <span className="text-xs text-slate-300">{label}</span>
      </div>
      <div className="flex-1" />
      <select
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
        className="bg-surface-850 border border-surface-600 rounded-md text-xs px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-accent-500"
      >
        <option value="all">All projects</option>
        {projects.map((project) => (
          <option key={project.projectId} value={project.projectId}>
            {project.projectName}
          </option>
        ))}
      </select>
      <a
        href="https://github.com/angelitosystems/nest-devtools/tree/main/docs"
        target="_blank"
        rel="noreferrer"
        className="text-xs px-3 py-1.5 rounded-md bg-surface-850 border border-surface-600 hover:bg-surface-700 text-slate-300 transition-colors"
      >
        Docs
      </a>
      <button
        onClick={onClear}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-surface-850 border border-surface-600 hover:bg-surface-700 hover:text-rose-300 text-slate-300 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" /> Clear
      </button>
    </header>
  );
}
