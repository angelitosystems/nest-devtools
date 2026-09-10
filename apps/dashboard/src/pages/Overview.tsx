import { AlertTriangle, ArrowUpRight, ScrollText, Radio } from 'lucide-react';
import type { DevToolsState } from '../store/store';
import { cn, formatDuration, formatTime, levelColor } from '../lib/utils';
import { EmptyState, MethodBadge, StatusChip } from '../components/ui';

export default function OverviewPage({
  store,
  onNavigate,
}: {
  store: DevToolsState;
  onNavigate: (page: 'requests' | 'logs' | 'errors' | 'performance') => void;
}) {
  const latestPerf = Object.values(store.performance)[0];
  const errorCount = store.errors.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Requests" value={String(store.requests.length)} onClick={() => onNavigate('requests')} />
        <StatCard label="Logs" value={String(store.logs.length)} onClick={() => onNavigate('logs')} />
        <StatCard label="Errors" value={String(errorCount)} tone={errorCount > 0 ? 'danger' : 'default'} onClick={() => onNavigate('errors')} />
        <StatCard
          label="Latency p95"
          value={latestPerf ? `${latestPerf.p95LatencyMs}ms` : '—'}
          onClick={() => onNavigate('performance')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Panel
          title="Requests"
          icon={<Radio className="h-4 w-4 text-accent-400" />}
          action="View all"
          onAction={() => onNavigate('requests')}
          count={store.requests.length}
        >
          <RequestFeed requests={store.requests.slice(-8).reverse()} />
        </Panel>
        <Panel
          title="Logs"
          icon={<ScrollText className="h-4 w-4 text-accent-400" />}
          action="View all"
          onAction={() => onNavigate('logs')}
          count={store.logs.length}
        >
          <LogFeed logs={store.logs.slice(-8).reverse()} />
        </Panel>
      </div>

      <Panel
        title="Recent errors"
        icon={<AlertTriangle className="h-4 w-4 text-rose-400" />}
        action="Error explorer"
        onAction={() => onNavigate('errors')}
        count={store.errorGroups.length}
      >
        <ErrorSummary groups={store.errorGroups.slice(0, 5)} />
      </Panel>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'danger';
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-surface-600 bg-surface-850 p-4 text-left transition-colors hover:border-accent-500/60"
    >
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold', tone === 'danger' && errorTone(value))}>{value}</div>
    </button>
  );
}

function errorTone(value: string): string {
  return value !== '0' ? 'text-rose-400' : 'text-slate-100';
}

function Panel({
  title,
  icon,
  action,
  onAction,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: string;
  onAction?: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-surface-600 bg-surface-850">
      <header className="flex h-10 items-center gap-2 border-b border-surface-700 bg-surface-900/60 px-4">
        {icon}
        <h2 className="text-sm font-medium">{title}</h2>
        {count !== undefined && <span className="text-[11px] text-slate-500">{count}</span>}
        {action && (
          <button onClick={onAction} className="ml-auto flex items-center gap-0.5 text-xs text-accent-400 hover:underline">
            {action}
            <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </header>
      <div className="max-h-72 overflow-auto">{children}</div>
    </section>
  );
}

function RequestFeed({ requests }: { requests: DevToolsState['requests'] }) {
  if (requests.length === 0) return <EmptyState title="No requests captured yet" />;
  return (
    <ul className="divide-y divide-surface-700 font-mono text-xs">
      {requests.map((request) => (
        <li key={request.requestId} className="flex items-center gap-3 px-4 py-2">
          <MethodBadge method={request.method} />
          <span className="flex-1 truncate text-slate-200">{request.url}</span>
          <StatusChip status={request.statusCode} />
          <span className="w-14 text-right text-slate-500">{formatDuration(request.duration)}</span>
        </li>
      ))}
    </ul>
  );
}

function LogFeed({ logs }: { logs: DevToolsState['logs'] }) {
  if (logs.length === 0) return <EmptyState title="No logs captured yet" />;
  return (
    <ul className="divide-y divide-surface-700 font-mono text-xs">
      {logs.map((log, index) => (
        <li key={`${log.timestamp}-${index}`} className="flex items-center gap-2 px-4 py-2">
          <span className="text-slate-600">{formatTime(log.timestamp)}</span>
          <span className={cn('w-10 uppercase', levelColor(log.level))}>{log.level}</span>
          <span className="flex-1 truncate text-slate-300">{log.message}</span>
        </li>
      ))}
    </ul>
  );
}

function ErrorSummary({ groups }: { groups: DevToolsState['errorGroups'] }) {
  if (groups.length === 0) return <EmptyState title="No errors — happy days" />;
  return (
    <ul className="divide-y divide-surface-700 font-mono text-xs">
      {groups.map((group) => (
        <li key={group.fingerprint} className="flex items-center gap-3 px-4 py-2">
          <span className="w-24 shrink-0 truncate text-rose-400">{group.sample.name}</span>
          <span className="flex-1 truncate text-slate-300">{group.sample.message}</span>
          <span className="text-slate-500">×{group.count}</span>
        </li>
      ))}
    </ul>
  );
}
