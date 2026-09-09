import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Database,
  Gauge,
  LayoutDashboard,
  ListTree,
  Radio,
  ScrollText,
  TerminalSquare,
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

type PageId =
  | 'overview'
  | 'requests'
  | 'logs'
  | 'errors'
  | 'performance'
  | 'modules'
  | 'controllers'
  | 'providers';

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
    ],
  },
  {
    section: 'Application',
    items: [
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

  const filtered = useMemo(() => {
    const byProject = <T extends { projectId: string }>(items: T[]): T[] =>
      projectFilter === 'all' ? items : items.filter((item) => item.projectId === projectFilter);
    return {
      ...store,
      requests: byProject(store.requests),
      logs: byProject(store.logs),
      errors: byProject(store.errors),
    };
  }, [store, projectFilter]);

  return (
    <div className="flex h-full">
      <Sidebar page={page} onNavigate={setPage} />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar
          state={store.connectionState}
          projects={store.projects}
          selected={projectFilter}
          onSelect={setProjectFilter}
          onClear={() => filtered.clear('all')}
        />
        <main className="flex-1 overflow-auto p-4 min-w-0">
          {page === 'overview' && <OverviewPage store={filtered} onNavigate={setPage} />}
          {page === 'requests' && <RequestsPage store={filtered} />}
          {page === 'logs' && <LogsPage store={filtered} />}
          {page === 'errors' && <ErrorsPage store={filtered} />}
          {page === 'performance' && <PerformancePage store={filtered} />}
          {(page === 'modules' || page === 'controllers' || page === 'providers') && (
            <ApplicationPage store={filtered} focus={page} />
          )}
        </main>
      </div>
    </div>
  );
}

function Sidebar({ page, onNavigate }: { page: PageId; onNavigate: (page: PageId) => void }) {
  return (
    <aside className="w-56 shrink-0 border-r border-surface-600 bg-surface-900 flex flex-col">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-surface-600">
        <TerminalSquare className="h-5 w-5 text-accent-400" />
        <span className="font-semibold tracking-tight">NestJS DevTools</span>
      </div>
      <nav className="flex-1 overflow-auto py-2">
        {NAV.map((group) => (
          <div key={group.section} className="mb-2">
            {group.section && (
              <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-slate-500">{group.section}</div>
            )}
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-1.5 text-sm text-left transition-colors',
                  page === item.id
                    ? 'bg-surface-800 text-accent-400 border-r-2 border-accent-400'
                    : 'text-slate-300 hover:bg-surface-850 hover:text-slate-100',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-slate-500">Coming soon</div>
        <div className="px-4 py-1 flex items-center gap-2.5 text-sm text-slate-600">
          <Database className="h-4 w-4" /> Database
        </div>
        <div className="px-4 py-1 flex items-center gap-2.5 text-sm text-slate-600">
          <Activity className="h-4 w-4" /> WebSockets
        </div>
      </nav>
      <div className="px-4 py-3 text-[11px] text-slate-600 border-t border-surface-600">v0.1.0 · MVP</div>
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
    <header className="h-14 shrink-0 border-b border-surface-600 bg-surface-900 flex items-center gap-4 px-4">
      <div className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full animate-pulse', dot)} />
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <div className="flex-1" />
      <select
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
        className="bg-surface-800 border border-surface-600 rounded-md text-sm px-2 py-1.5 text-slate-200"
      >
        <option value="all">All projects</option>
        {projects.map((project) => (
          <option key={project.projectId} value={project.projectId}>
            {project.projectName}
          </option>
        ))}
      </select>
      <button
        onClick={onClear}
        className="text-sm px-3 py-1.5 rounded-md bg-surface-800 border border-surface-600 hover:bg-surface-700 text-slate-300"
      >
        Clear
      </button>
    </header>
  );
}
