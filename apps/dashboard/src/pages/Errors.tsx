import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { DevToolsState } from '../store/store';
import { cn, formatTime } from '../lib/utils';

export default function ErrorsPage({ store }: { store: DevToolsState }) {
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(null);
  const selected = store.errorGroups.find((group) => group.fingerprint === selectedFingerprint) ?? store.errorGroups[0];
  const instances = store.errors.filter((error) => error.fingerprint === selected?.fingerprint);

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="flex-1 bg-surface-850 border border-surface-600 rounded-lg overflow-auto">
        {store.errorGroups.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No errors captured. Happy days.</div>
        ) : (
          <ul className="divide-y divide-surface-700">
            {store.errorGroups.map((group) => (
              <li
                key={group.fingerprint}
                onClick={() => setSelectedFingerprint(group.fingerprint)}
                className={cn(
                  'px-4 py-3 cursor-pointer hover:bg-surface-800',
                  selected?.fingerprint === group.fingerprint && 'bg-surface-800',
                )}
              >
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-rose-400 font-semibold">{group.sample.name}</span>
                  <span className="text-slate-300 truncate flex-1">{group.sample.message}</span>
                  <span
                    className={cn(
                      'px-1.5 rounded text-[10px]',
                      group.count > 10 ? 'bg-rose-500/20 text-rose-300' : 'bg-surface-700 text-slate-400',
                    )}
                  >
                    ×{group.count}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-600 font-mono">
                  {group.sample.source
                    ? `${group.sample.source.file.split(/[\\/]/).pop()}:${group.sample.source.line}`
                    : 'unknown source'}
                  {' · '}
                  last seen {formatTime(group.sample.timestamp)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <aside className="w-[480px] shrink-0 bg-surface-850 border border-surface-600 rounded-lg overflow-auto">
          <header className="px-4 py-3 border-b border-surface-700">
            <div className="font-mono text-sm text-rose-400">{selected.sample.name}</div>
            <div className="font-mono text-xs text-slate-300 mt-1">{selected.sample.message}</div>
          </header>
          <div className="p-4 space-y-4 text-xs">
            <Meta label="Occurrences" value={String(selected.count)} />
            <Meta label="Project" value={selected.projectId} />
            {selected.sample.source && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Source</div>
                <div className="flex items-center gap-2 font-mono">
                  <code className="bg-surface-900 px-2 py-1 rounded text-slate-300">
                    {selected.sample.source.file}:{selected.sample.source.line}:{selected.sample.source.column}
                  </code>
                  {selected.sample.source.absolutePath && (
                    <a
                      title="Open in VS Code"
                      href={`vscode://file/${selected.sample.source.absolutePath.replace(/\\/g, '/')}:${selected.sample.source.line}:${selected.sample.source.column}`}
                      className="text-accent-400 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5 inline" /> VS Code
                    </a>
                  )}
                </div>
              </div>
            )}
            {selected.sample.request && (
              <Meta
                label="Request"
                value={`${selected.sample.request.method} ${selected.sample.request.url}${
                  selected.sample.request.statusCode ? ` → ${selected.sample.request.statusCode}` : ''
                }`}
              />
            )}
            {selected.sample.stack && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Stack trace</div>
                <pre className="bg-surface-900 rounded p-3 text-[10px] leading-relaxed overflow-auto text-slate-400 whitespace-pre-wrap">
                  {selected.sample.stack}
                </pre>
              </div>
            )}
            {instances.length > 1 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Recent occurrences</div>
                <ul className="space-y-1 font-mono text-[11px] text-slate-500">
                  {instances.slice(-8).reverse().map((instance, index) => (
                    <li key={index}>
                      {formatTime(instance.timestamp)}
                      {instance.requestId ? ` · ${instance.requestId.slice(0, 12)}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="font-mono text-slate-300">{value}</div>
    </div>
  );
}
