import { useMemo, useState } from 'react';
import { Terminal, X } from 'lucide-react';
import type { RequestCompletedPayload } from '@angelitosystems/devtools-protocol';
import type { DevToolsState } from '../store/store';
import { cn, formatDuration, formatTime, toCurl } from '../lib/utils';
import { CopyButton, EmptyState, JsonView, MethodBadge, SplitPane, StatusChip, Tabs } from '../components/ui';

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
    <SplitPane
      defaultLeftWidth={520}
      left={
        <div className="flex h-full min-h-0 flex-col pr-3">
          <div className="relative mb-3">
            <Terminal className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by url, method or status…"
              className="w-full rounded-md border border-surface-600 bg-surface-850 py-2 pl-9 pr-3 text-sm font-mono focus:border-accent-500 focus:outline-none"
            />
          </div>
          <div className="flex-1 overflow-auto rounded-lg border border-surface-600 bg-surface-850">
            {filtered.length === 0 ? (
              <EmptyState title="No requests yet" hint="They'll appear here in real time as your app receives traffic." />
            ) : (
              <table className="w-full font-mono text-xs">
                <thead className="sticky top-0 z-10 bg-surface-900 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Method</th>
                    <th className="px-2 py-2 text-left">URL</th>
                    <th className="px-2 py-2 text-right">Status</th>
                    <th className="px-2 py-2 text-right">Time</th>
                    <th className="px-3 py-2 text-right">At</th>
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
                      <td className="px-3 py-1.5">
                        <MethodBadge method={request.method} />
                      </td>
                      <td className="max-w-[280px] truncate px-2 py-1.5 text-slate-200">{request.url}</td>
                      <td className="px-2 py-1.5 text-right">
                        <StatusChip status={request.statusCode} />
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{formatDuration(request.duration)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{formatTime(request.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      }
      right={
        selected ? (
          <RequestDetail key={selected.requestId} request={selected} onClose={() => setSelectedId(null)} />
        ) : (
          <EmptyState title="Select a request" hint="Pick a row on the left to inspect headers, body and timing." />
        )
      }
    />
  );
}

function RequestDetail({ request, onClose }: { request: RequestCompletedPayload; onClose: () => void }) {
  const [tab, setTab] = useState<'overview' | 'headers' | 'body' | 'response'>('overview');
  const total = Math.max(request.duration, 1);
  const layers = groupByLayer(request.timeline);
  const headerCount =
    Object.keys(request.requestHeaders ?? {}).length + Object.keys(request.headers ?? {}).length;
  const hasBody = request.requestBody !== undefined;
  const hasResponse = request.responseBody !== undefined || request.responsePreview !== undefined;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-surface-600 bg-surface-850 pl-3">
      <header className="flex items-start justify-between gap-3 border-b border-surface-700 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-sm">
            <MethodBadge method={request.method} />
            <span className="truncate text-slate-200">{request.url}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            <StatusChip status={request.statusCode} />
            <span className="text-slate-500">{formatDuration(request.duration)}</span>
            <span className="text-slate-600">{formatTime(request.startedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButton value={toCurl(request)} label="Copy as cURL" />
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-surface-700 hover:text-slate-200 lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Timeline' },
          { id: 'headers', label: 'Headers', count: headerCount },
          { id: 'body', label: 'Body', count: hasBody ? 1 : 0 },
          { id: 'response', label: 'Response', count: hasResponse ? 1 : 0 },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="flex-1 overflow-auto">
        {tab === 'overview' && (
          <>
            <section className="p-4">
              <div className="space-y-3">
                {layers.map(([layer, spans]) => (
                  <div key={layer}>
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">{layer}</div>
                    {spans.map((span, index) => {
                      const percent = Math.min(100, (span.duration / total) * 100);
                      return (
                        <div key={index} className="mb-1.5">
                          <div className="flex justify-between font-mono text-[11px]">
                            <span className="truncate text-slate-300">{span.label}</span>
                            <span className="text-slate-500">{formatDuration(span.duration)}</span>
                          </div>
                          <div className="h-1 rounded bg-surface-700">
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
              <section className="border-t border-surface-700 px-4 py-3">
                <h3 className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Query params</h3>
                <div className="rounded bg-surface-900 p-2.5">
                  <JsonView value={request.query} />
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'headers' && (
          <>
            {request.requestHeaders && Object.keys(request.requestHeaders).length > 0 && (
              <JsonSection title="Request headers" value={request.requestHeaders} />
            )}
            {request.headers && Object.keys(request.headers).length > 0 && (
              <JsonSection title="Response headers" value={request.headers} />
            )}
            {headerCount === 0 && <EmptyState title="No headers captured" />}
          </>
        )}
        {tab === 'body' && (hasBody ? <JsonSection title="Request body" value={request.requestBody} /> : <EmptyState title="No request body" />)}
        {tab === 'response' &&
          (hasResponse ? (
            <JsonSection title="Response" value={request.responseBody ?? request.responsePreview} />
          ) : (
            <EmptyState title="No response body captured" />
          ))}
      </div>
    </div>
  );
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  const isPlainObject = value !== null && typeof value === 'object';
  const formatted = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <section className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500">{title}</h3>
        <CopyButton value={formatted ?? ''} />
      </div>
      <div className="overflow-auto rounded bg-surface-900 p-2.5">
        {isPlainObject ? <JsonView value={value} /> : <pre className="whitespace-pre-wrap break-all font-mono text-[12px] text-slate-300">{formatted}</pre>}
      </div>
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
