import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Search, Trash2 } from 'lucide-react';
import type { DevToolsState } from '../store/store';
import { cn, formatTime, levelColor } from '../lib/utils';
import { EmptyState } from '../components/ui';

const LEVELS = ['all', 'debug', 'info', 'warn', 'error'] as const;

export default function LogsPage({ store }: { store: DevToolsState }) {
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('all');
  const [query, setQuery] = useState('');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const latest = useRef(store.logs);
  latest.current = store.logs;
  const [visible, setVisible] = useState<DevToolsState['logs']>([]);

  useEffect(() => {
    if (!paused) setVisible(store.logs);
  }, [store.logs, paused]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return [...visible]
      .reverse()
      .filter((log) => (level === 'all' || log.level === level) && (term === '' || log.message.toLowerCase().includes(term)));
  }, [visible, level, query]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: store.logs.length, debug: 0, info: 0, warn: 0, error: 0 };
    for (const log of store.logs) map[log.level] = (map[log.level] ?? 0) + 1;
    return map;
  }, [store.logs]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-surface-600 bg-surface-850">
          {LEVELS.map((option) => (
            <button
              key={option}
              onClick={() => setLevel(option)}
              className={cn(
                'px-3 py-1.5 text-xs uppercase tracking-wide transition-colors',
                level === option ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {option} <span className={level === option ? 'text-white/70' : 'text-slate-500'}>{counts[option] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search logs…"
            className="w-full rounded-md border border-surface-600 bg-surface-850 py-2 pl-9 pr-3 text-sm font-mono focus:border-accent-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setPaused((p) => !p)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-surface-600 px-3 py-2 text-xs transition-colors',
            paused ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-surface-850 hover:bg-surface-700 text-slate-300',
          )}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => store.clear('logs')}
          className="flex items-center gap-1.5 rounded-md border border-surface-600 bg-surface-850 px-3 py-2 text-xs text-slate-300 hover:bg-surface-700"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear
        </button>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-surface-600 bg-surface-850 font-mono text-xs">
        {filtered.length === 0 ? (
          <EmptyState title="No logs match the current filters" />
        ) : (
          <ul className="divide-y divide-surface-700">
            {filtered.slice(0, 500).map((log, index) => (
              <li key={`${log.timestamp}-${index}`} className="flex items-start gap-3 px-4 py-1.5 hover:bg-surface-800">
                <span className="shrink-0 text-slate-600">{formatTime(log.timestamp)}</span>
                <span className={cn('w-10 shrink-0 uppercase', levelColor(log.level))}>{log.level}</span>
                <span className="break-all text-slate-300">
                  {log.message}
                  {log.source && (
                    <span className="text-slate-600">
                      {' '}
                      — {log.source.file.split(/[\\/]/).pop()}:{log.source.line}
                    </span>
                  )}
                  {log.requestId && <span className="ml-2 text-slate-700">req {log.requestId.slice(0, 10)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
