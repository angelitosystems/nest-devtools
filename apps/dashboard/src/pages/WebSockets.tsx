import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Radio, Search } from 'lucide-react';
import type { DevToolsState } from '../store/store';
import { cn, formatTime } from '../lib/utils';
import { EmptyState, JsonView } from '../components/ui';

export default function WebSocketsPage({ store }: { store: DevToolsState }) {
  const [query, setQuery] = useState('');
  const messages = useMemo(() => {
    const term = query.toLowerCase();
    return [...store.websocketMessages].reverse().filter((item) => `${item.gateway} ${item.event} ${item.direction}`.toLowerCase().includes(term));
  }, [store.websocketMessages, query]);
  const latestConnections = [...store.websocketConnections].reverse();

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-surface-600 bg-surface-850">
        <header className="flex h-10 items-center gap-2 border-b border-surface-700 bg-surface-900/60 px-4">
          <Radio className="h-4 w-4 text-accent-400" />
          <h2 className="text-sm font-medium">Gateway connections</h2>
        </header>
        {latestConnections.length === 0 ? (
          <EmptyState title="No gateway snapshots captured yet" />
        ) : (
          <div className="grid grid-cols-3 gap-3 p-4">
            {latestConnections.slice(0, 12).map((item, index) => (
              <div key={`${item.timestamp}-${index}`} className="rounded-md border border-surface-700 p-3">
                <div className="truncate text-xs text-slate-400">{item.gateway}</div>
                <div className="mt-1 text-xl text-slate-100">{item.connections}</div>
                <div className="text-[10px] text-slate-600">
                  {item.namespace} · {formatTime(item.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="overflow-hidden rounded-lg border border-surface-600 bg-surface-850">
        <header className="flex h-12 items-center gap-3 border-b border-surface-700 bg-surface-900/60 px-4">
          <h2 className="text-sm font-medium">Message flow</h2>
          <span className="text-[11px] text-slate-500">{store.websocketMessages.length}</span>
          <div className="relative ml-auto w-64">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter gateway or event…"
              className="w-full rounded border border-surface-600 bg-surface-800 py-1 pl-7 pr-2 text-xs font-mono focus:border-accent-500 focus:outline-none"
            />
          </div>
        </header>
        {messages.length === 0 ? (
          <EmptyState title="No WebSocket messages captured yet" />
        ) : (
          <ul className="divide-y divide-surface-700 font-mono text-xs">
            {messages.slice(0, 500).map((item, index) => (
              <li key={`${item.timestamp}-${index}`} className="px-4 py-2 hover:bg-surface-800">
                <div className="flex items-center gap-3">
                  <span className="text-slate-600">{formatTime(item.timestamp)}</span>
                  <span className={cn('flex w-24 items-center gap-1', item.direction === 'sent' ? 'text-sky-300' : 'text-emerald-300')}>
                    {item.direction === 'sent' ? <ArrowUpFromLine className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                    {item.direction}
                  </span>
                  <span className="text-accent-400">{item.gateway}</span>
                  <span className="truncate text-slate-200">{item.event}</span>
                  <span className="ml-auto text-slate-500">{item.payloadSize} B</span>
                  {item.error && <span className="max-w-48 truncate text-rose-400">{item.error}</span>}
                </div>
                {item.payloadPreview !== undefined && (
                  <div className="ml-[7.5rem] mt-2 max-h-32 overflow-auto rounded bg-surface-900 p-2 text-[10px]">
                    {typeof item.payloadPreview === 'string' ? (
                      <pre className="whitespace-pre-wrap break-all text-slate-400">{item.payloadPreview}</pre>
                    ) : (
                      <JsonView value={item.payloadPreview} />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
