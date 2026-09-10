import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { DevToolsState } from '../store/store';
import { cn, formatTime } from '../lib/utils';
import { CopyButton, EmptyState, MethodBadge, SplitPane, StatusChip } from '../components/ui';

export default function ErrorsPage({ store }: { store: DevToolsState }) {
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(null);
  const selected = store.errorGroups.find((group) => group.fingerprint === selectedFingerprint) ?? store.errorGroups[0];
  const instances = store.errors.filter((error) => error.fingerprint === selected?.fingerprint);

  return (
    <SplitPane
      defaultLeftWidth={460}
      left={
        <div className="h-full overflow-auto rounded-lg border border-surface-600 bg-surface-850 mr-3">
          {store.errorGroups.length === 0 ? (
            <EmptyState title="No errors captured" hint="Happy days — nothing to triage right now." />
          ) : (
            <ul className="divide-y divide-surface-700">
              {store.errorGroups.map((group) => (
                <li
                  key={group.fingerprint}
                  onClick={() => setSelectedFingerprint(group.fingerprint)}
                  className={cn(
                    'cursor-pointer px-4 py-3 hover:bg-surface-800',
                    selected?.fingerprint === group.fingerprint && 'bg-surface-800',
                  )}
                >
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="font-semibold text-rose-400">{group.sample.name}</span>
                    <span className="flex-1 truncate text-slate-300">{group.sample.message}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 text-[10px]',
                        group.count > 10 ? 'bg-rose-500/20 text-rose-300' : 'bg-surface-700 text-slate-400',
                      )}
                    >
                      ×{group.count}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-600">
                    {group.sample.source ? `${group.sample.source.file.split(/[\\/]/).pop()}:${group.sample.source.line}` : 'unknown source'}
                    {' · '}
                    last seen {formatTime(group.sample.timestamp)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
      right={
        selected ? (
          <div className="h-full overflow-auto rounded-lg border border-surface-600 bg-surface-850 pl-3">
            <header className="border-b border-surface-700 px-4 py-3">
              <div className="font-mono text-sm text-rose-400">{selected.sample.name}</div>
              <div className="mt-1 font-mono text-xs text-slate-300">{selected.sample.message}</div>
            </header>
            <div className="space-y-4 p-4 text-xs">
              <div className="flex gap-8">
                <Meta label="Occurrences" value={String(selected.count)} />
                <Meta label="Project" value={selected.projectId} />
              </div>
              {selected.sample.source && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Source</div>
                  <div className="flex items-center gap-2 font-mono">
                    <code className="rounded bg-surface-900 px-2 py-1 text-slate-300">
                      {selected.sample.source.file}:{selected.sample.source.line}:{selected.sample.source.column}
                    </code>
                    {selected.sample.source.absolutePath && (
                      <a
                        title="Open in VS Code"
                        href={`vscode://file/${selected.sample.source.absolutePath.replace(/\\/g, '/')}:${selected.sample.source.line}:${selected.sample.source.column}`}
                        className="flex items-center gap-1 text-accent-400 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> VS Code
                      </a>
                    )}
                  </div>
                </div>
              )}
              {selected.sample.request && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Request</div>
                  <div className="flex items-center gap-2 font-mono">
                    <MethodBadge method={selected.sample.request.method} />
                    <span className="truncate text-slate-300">{selected.sample.request.url}</span>
                    {selected.sample.request.statusCode && <StatusChip status={selected.sample.request.statusCode} />}
                  </div>
                </div>
              )}
              {selected.sample.stack && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Stack trace</div>
                    <CopyButton value={selected.sample.stack} />
                  </div>
                  <pre className="overflow-auto whitespace-pre-wrap rounded bg-surface-900 p-3 text-[10px] leading-relaxed text-slate-400">
                    {selected.sample.stack}
                  </pre>
                </div>
              )}
              {instances.length > 1 && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Recent occurrences</div>
                  <ul className="space-y-1 font-mono text-[11px] text-slate-500">
                    {instances
                      .slice(-8)
                      .reverse()
                      .map((instance, index) => (
                        <li key={index}>
                          {formatTime(instance.timestamp)}
                          {instance.requestId ? ` · ${instance.requestId.slice(0, 12)}` : ''}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState title="Select an error" hint="Pick a group on the left to see its stack trace and occurrences." />
        )
      }
    />
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-slate-300">{value}</div>
    </div>
  );
}
