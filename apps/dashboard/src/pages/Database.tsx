import { useMemo, useState } from 'react';
import { Database as DatabaseIcon, Search } from 'lucide-react';
import type { DevToolsState } from '../store/store';
import { formatDuration, formatTime } from '../lib/utils';

export default function DatabasePage({ store }: { store: DevToolsState }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return [...store.queries].reverse().filter((item) => item.sql.toLowerCase().includes(term) || item.provider.includes(term));
  }, [store.queries, query]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter queries…" className="w-full bg-surface-850 border border-surface-600 rounded-md pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-accent-500" />
        </div>
        <button onClick={() => store.clear('queries')} className="text-xs px-3 py-2 rounded-md bg-surface-850 border border-surface-600 hover:bg-surface-700">Clear</button>
      </div>
      <div className="bg-surface-850 border border-surface-600 rounded-lg flex-1 overflow-auto">
        {filtered.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No database queries captured yet.</div> : (
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-surface-900 text-slate-500 uppercase text-[10px] tracking-wider">
              <tr><th className="text-left px-4 py-2">Provider</th><th className="text-left px-2 py-2">Query</th><th className="text-right px-2 py-2">Duration</th><th className="text-right px-4 py-2">Time</th></tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {filtered.slice(0, 500).map((item, index) => (
                <tr key={`${item.timestamp}-${index}`} className="hover:bg-surface-800">
                  <td className="px-4 py-2 text-accent-400"><DatabaseIcon className="inline h-3.5 w-3.5 mr-2" />{item.provider}</td>
                  <td className="px-2 py-2 text-slate-300 whitespace-pre-wrap break-all">{item.sql}{item.parameters && <div className="mt-1 text-slate-600">params {JSON.stringify(item.parameters)}</div>}</td>
                  <td className="px-2 py-2 text-right text-amber-300">{formatDuration(item.duration)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{formatTime(item.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
