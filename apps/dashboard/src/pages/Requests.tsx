import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { RequestCompletedPayload } from '@angelitosystems/devtools-protocol';
import type { DevToolsState } from '../store/store';
import { cn, formatDuration, formatTime, statusColor } from '../lib/utils';

export default function RequestsPage({ store }: { store: DevToolsState }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return [...store.requests]
      .reverse()
      .filter(
        (request) =>
          term === '' ||
          request.url.toLowerCase().includes(term) ||
          request.method.toLowerCase().includes(term) ||
          String(request.statusCode).includes(term),
      );
  }, [store.requests, query]);

  const selected = filtered.find((request) => request.requestId === selectedId) ?? filtered[0];

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by url, method or status…"
            className="w-full bg-surface-850 border border-surface-600 rounded-md pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-accent-500"
          />
        </div>
        <div className="bg-surface-850 border border-surface-600 rounded-lg overflow-auto flex-1">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No requests yet — they appear here in real time.</div>
          ) : (
            <table className="w-full font-mono text-xs">
              <thead className="sticky top-0 bg-surface-900 text-slate-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Method</th>
                  <th className="text-left px-2 py-2">URL</th>
                  <th className="text-right px-2 py-2">Status</th>
                  <th className="text-right px-2 py-2">Duration</th>
                  <th className="text-right px-4 py-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700">
                {filtered.slice(0, 200).map((request) => (
                  <tr
                    key={request.requestId}
                    onClick={() => setSelectedId(request.requestId)}
                    className={cn(
                      'cursor-pointer hover:bg-surface-800',
                      selected?.requestId === request.requestId && 'bg-surface-800',
                    )}
                  >
                    <td className="px-4 py-1.5 text-accent-400">{request.method}</td>
                    <td className="px-2 py-1.5 text-slate-200 truncate max-w-[280px]">{request.url}</td>
                    <td className={cn('px-2 py-1.5 text-right', statusColor(request.statusCode))}>{request.statusCode}</td>
                    <td className="px-2 py-1.5 text-right text-slate-400">{formatDuration(request.duration)}</td>
                    <td className="px-4 py-1.5 text-right text-slate-600">{formatTime(request.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && <RequestDetail request={selected} />}
    </div>
  );
}

function RequestDetail({ request }: { request: RequestCompletedPayload }) {
  const total = Math.max(request.duration, 1);
  const layers = groupByLayer(request.timeline);

  return (
    <aside className="w-96 shrink-0 bg-surface-850 border border-surface-600 rounded-lg overflow-auto">
      <header className="px-4 py-3 border-b border-surface-700">
        <div className="font-mono text-sm">
          <span className="text-accent-400">{request.method}</span> <span className="text-slate-200">{request.url}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs">
          <span className={statusColor(request.statusCode)}>{request.statusCode}</span>
          <span className="text-slate-500">{formatDuration(request.duration)}</span>
          <span className="text-slate-600">{formatTime(request.startedAt)}</span>
        </div>
      </header>

      <section className="p-4">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Timeline</h3>
        <div className="space-y-3">
          {layers.map(([layer, spans]) => (
            <div key={layer}>
              <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">{layer}</div>
              {spans.map((span, index) => {
                const percent = Math.min(100, (span.duration / total) * 100);
                return (
                  <div key={index} className="mb-1.5">
                    <div className="flex justify-between font-mono text-[11px]">
                      <span className="text-slate-300 truncate">{span.label}</span>
                      <span className="text-slate-500">{formatDuration(span.duration)}</span>
                    </div>
                    <div className="h-1 bg-surface-700 rounded">
                      <div
                        className={cn('h-1 rounded', span.status === 'error' ? 'bg-rose-500' : 'bg-accent-500')}
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {layers.length === 0 && <p className="text-xs text-slate-500">No timeline spans captured.</p>}
        </div>
      </section>

      {request.query && Object.keys(request.query).length > 0 && (
        <section className="px-4 pb-4">
          <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Query</h3>
          <pre className="text-[11px] font-mono bg-surface-900 rounded p-2 overflow-auto text-slate-300">
            {JSON.stringify(request.query, null, 2)}
          </pre>
        </section>
      )}

      {request.headers && Object.keys(request.headers).length > 0 && (
        <JsonSection title="Response headers" value={request.headers} />
      )}
      {request.requestBody !== undefined && <JsonSection title="Request body" value={request.requestBody} />}
      {(request.responseBody !== undefined || request.responsePreview) && (
        <JsonSection title="Response" value={request.responseBody ?? request.responsePreview} />
      )}
    </aside>
  );
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="px-4 pb-4">
      <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
      <pre className="text-[11px] font-mono bg-surface-900 rounded p-2 overflow-auto text-slate-300 whitespace-pre-wrap break-all">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function groupByLayer(timeline: RequestCompletedPayload['timeline']): Array<[string, typeof timeline]> {
  const map = new Map<string, typeof timeline>();
  for (const span of timeline) {
    const list = map.get(span.layer) ?? [];
    list.push(span);
    map.set(span.layer, list);
  }
  return [...map.entries()];
}
