import { useMemo, useState } from 'react';
import { Database as DatabaseIcon, Search } from 'lucide-react';
import type { DevToolsState } from '../store/store';
import { formatDuration, formatTime } from '../lib/utils';
import { EmptyState } from '../components/ui';

export default function DatabasePage({ store }: { store: DevToolsState }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return [...store.queries].reverse().filter((item) => item.sql.toLowerCase().includes(term) || item.provider.includes(term));
  }, [store.queries, query]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter queries…"
            className="w-full rounded-md border border-surface-600 bg-surface-850 py-2 pl-9 pr-3 text-sm font-mono focus:border-accent-500 focus:outline-none"
          />
        </div>
        <button onClick={() => store.clear('queries')} className="rounded-md border border-surface-600 bg-surface-850 px-3 py-2 text-xs hover:bg-surface-700">
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-surface-600 bg-surface-850">
        {filtered.length === 0 ? (
          <EmptyState title="No database queries captured yet" />
        ) : (
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-surface-900 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Provider</th>
                <th className="px-2 py-2 text-left">Query</th>
                <th className="px-2 py-2 text-right">Duration</th>
                <th className="px-4 py-2 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {filtered.slice(0, 500).map((item, index) => (
                <tr key={`${item.timestamp}-${index}`} className="hover:bg-surface-800">
                  <td className="px-4 py-2 align-top text-accent-400">
                    <DatabaseIcon className="mr-2 inline h-3.5 w-3.5" />
                    {item.provider}
                  </td>
                  <td className="whitespace-pre-wrap break-all px-2 py-2 text-slate-300">
                    {item.sql}
                    {item.parameters !== undefined && <div className="mt-1 text-slate-600">params {JSON.stringify(item.parameters)}</div>}
                  </td>
                  <td className="px-2 py-2 text-right align-top text-amber-300">{formatDuration(item.duration)}</td>
                  <td className="px-4 py-2 text-right align-top text-slate-600">{formatTime(item.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
