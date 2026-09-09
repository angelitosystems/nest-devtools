import { useMemo, useState } from 'react';
import { Box, Boxes, FolderGit2, Puzzle } from 'lucide-react';
import type { AppModuleNode } from '@angelitosystems/devtools-protocol';
import type { DevToolsState } from '../store/store';
import { cn } from '../lib/utils';

export default function ApplicationPage({ store, focus }: { store: DevToolsState; focus: 'modules' | 'controllers' | 'providers' }) {
  const snapshots = Object.values(store.apps);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  const flat = useMemo(() => {
    const controllers: Array<{ module: string; name: string }> = [];
    const providers: Array<{ module: string; name: string; type: string }> = [];
    for (const snapshot of snapshots) {
      for (const module of snapshot.modules) {
        for (const controller of module.controllers) controllers.push({ module: module.name, name: controller.name });
        for (const provider of module.providers) providers.push({ module: module.name, name: provider.name, type: provider.type });
      }
    }
    return { controllers, providers };
  }, [snapshots]);

  if (snapshots.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-slate-500">
        Connect a NestJS application to explore its modules, controllers and providers.
      </div>
    );
  }

  const snapshot = snapshots[0];
  const current = snapshot.modules.find((module) => module.name === selectedModule) ?? snapshot.modules[0];

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="w-72 shrink-0 bg-surface-850 border border-surface-600 rounded-lg overflow-auto">
        <div className="px-4 py-2 border-b border-surface-700 text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <FolderGit2 className="h-3.5 w-3.5" /> {snapshot.projectName}
        </div>
        <ModuleTree
          modules={snapshot.modules}
          selected={current?.name}
          onSelect={setSelectedModule}
        />
      </div>

      <div className="flex-1 bg-surface-850 border border-surface-600 rounded-lg overflow-auto p-4">
        {focus === 'modules' && current && (
          <>
            <h2 className="flex items-center gap-2 text-base font-semibold mb-4">
              <Boxes className="h-4 w-4 text-accent-400" /> {current.name}
            </h2>
            <MemberList title="Controllers" members={current.controllers.map((m) => m.name)} color="text-accent-400" />
            <MemberList title="Providers" members={current.providers.map((m) => m.name)} color="text-emerald-400" />
          </>
        )}

        {focus === 'controllers' && (
          <>
            <h2 className="text-base font-semibold mb-4">All controllers ({flat.controllers.length})</h2>
            <MemberList title="Controllers" members={flat.controllers.map((c) => `${c.name} — ${c.module}`)} color="text-accent-400" />
          </>
        )}

        {focus === 'providers' && (
          <>
            <h2 className="text-base font-semibold mb-4">All providers ({flat.providers.length})</h2>
            <MemberList
              title="Providers"
              members={flat.providers.map((p) => `${p.name} — ${p.module}${p.type !== 'provider' ? ` (${p.type})` : ''}`)}
              color="text-emerald-400"
            />
          </>
        )}
      </div>
    </div>
  );
}

function ModuleTree({
  modules,
  selected,
  onSelect,
}: {
  modules: AppModuleNode[];
  selected?: string;
  onSelect: (name: string) => void;
}) {
  return (
    <ul className="p-2 font-mono text-xs">
      {modules.map((module) => (
        <li key={module.name}>
          <button
            onClick={() => onSelect(module.name)}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded flex items-center gap-2',
              selected === module.name ? 'bg-surface-700 text-accent-400' : 'text-slate-300 hover:bg-surface-800',
            )}
          >
            <Box className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{module.name}</span>
            <span className="ml-auto text-slate-600 text-[10px]">{module.controllers.length + module.providers.length}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MemberList({ title, members, color }: { title: string; members: string[]; color: string }) {
  return (
    <section className="mb-4">
      <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
      {members.length === 0 ? (
        <p className="text-xs text-slate-600">None</p>
      ) : (
        <ul className="space-y-1">
          {members.map((member, index) => (
            <li key={`${member}-${index}`} className={cn('font-mono text-xs flex items-center gap-2', color)}>
              <Puzzle className="h-3 w-3 opacity-60" />
              {member}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
