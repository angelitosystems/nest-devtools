import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Radio } from 'lucide-react';
import type { DevToolsState } from '../store/store';
import { cn, formatTime } from '../lib/utils';

export default function WebSocketsPage({ store }: { store: DevToolsState }) {
  const [query, setQuery] = useState('');
  const messages = useMemo(() => {
    const term = query.toLowerCase();
    return [...store.websocketMessages].reverse().filter((item) => `${item.gateway} ${item.event} ${item.direction}`.toLowerCase().includes(term));
  }, [store.websocketMessages, query]);
  const latestConnections = [...store.websocketConnections].reverse();

  return (
    <div className="space-y-4">
      <section className="bg-surface-850 border border-surface-600 rounded-lg overflow-hidden">
        <header className="flex items-center gap-2 px-4 h-10 border-b border-surface-700 bg-surface-900/60">
          <Radio className="h-4 w-4 text-accent-400" /><h2 className="text-sm font-medium">Gateway connections</h2>
        </header>
        {latestConnections.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No gateway snapshots captured yet.</div> : (
          <div className="grid grid-cols-3 gap-3 p-4">
            {latestConnections.slice(0, 12).map((item, index) => <div key={`${item.timestamp}-${index}`} className="border border-surface-700 rounded-md p-3"><div className="text-xs text-slate-400 truncate">{item.gateway}</div><div className="mt-1 text-xl text-slate-100">{item.connections}</div><div className="text-[10px] text-slate-600">{item.namespace} · {formatTime(item.timestamp)}</div></div>)}
          </div>
        )}
      </section>
      <section className="bg-surface-850 border border-surface-600 rounded-lg overflow-hidden">
        <header className="flex items-center gap-3 px-4 h-12 border-b border-surface-700 bg-surface-900/60">
          <h2 className="text-sm font-medium">Message flow</h2><span className="text-[11px] text-slate-500">{store.websocketMessages.length}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter gateway or event…" className="ml-auto w-64 bg-surface-800 border border-surface-600 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent-500" />
        </header>
        {messages.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No WebSocket messages captured yet.</div> : (
          <ul className="divide-y divide-surface-700 font-mono text-xs">
            {messages.slice(0, 500).map((item, index) => <li key={`${item.timestamp}-${index}`} className="px-4 py-2 hover:bg-surface-800"><div className="flex items-center gap-3"><span className="text-slate-600">{formatTime(item.timestamp)}</span><span className={cn('flex items-center gap-1 w-24', item.direction === 'sent' ? 'text-sky-300' : 'text-emerald-300')}>{item.direction === 'sent' ? <ArrowUpFromLine className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}{item.direction}</span><span className="text-accent-300">{item.gateway}</span><span className="text-slate-200 truncate">{item.event}</span><span className="ml-auto text-slate-500">{item.payloadSize} B</span>{item.error && <span className="text-rose-400 truncate max-w-48">{item.error}</span>}</div>{item.payloadPreview !== undefined && <pre className="mt-2 ml-[7.5rem] max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-900 p-2 text-[10px] text-slate-400">{typeof item.payloadPreview === 'string' ? item.payloadPreview : JSON.stringify(item.payloadPreview, null, 2)}</pre>}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
