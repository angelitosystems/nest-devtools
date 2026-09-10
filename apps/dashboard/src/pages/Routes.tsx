import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Route as RouteIcon,
  ShieldCheck,
  Layers,
  Filter as FilterIcon,
  Wand2,
} from "lucide-react";
import type {
  AppSnapshot,
  RouteNode,
} from "@angelitosystems/devtools-protocol";
import type { DevToolsState } from "../store/store";
import { cn } from "../lib/utils";
import { CopyButton, EmptyState, MethodBadge } from "../components/ui";

export default function RoutesPage({ store }: { store: DevToolsState }) {
  const snapshots = Object.values(store.apps);
  const [query, setQuery] = useState("");
  const [openControllers, setOpenControllers] = useState<
    Record<string, boolean>
  >({});

  if (snapshots.length === 0) {
    return (
      <EmptyState
        title="No application connected"
        hint="Connect a NestJS application to list its routes, prefix, guards and DTOs."
        icon={<RouteIcon className="h-6 w-6" />}
      />
    );
  }

  const snapshot: AppSnapshot = snapshots[0];
  const globals = snapshot.globals;

  const controllers = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list: Array<{
      module: string;
      name: string;
      basePath?: string;
      routes: RouteNode[];
    }> = [];
    for (const module of snapshot.modules) {
      for (const controller of module.controllers) {
        const routes = (controller.routeDetails ?? []).filter(
          (route) =>
            term === "" ||
            route.path.toLowerCase().includes(term) ||
            route.method.toLowerCase().includes(term) ||
            controller.name.toLowerCase().includes(term),
        );
        if (routes.length === 0 && term !== "") continue;
        if ((controller.routeDetails ?? []).length === 0) continue; // skip non-HTTP controllers
        list.push({
          module: module.name,
          name: controller.name,
          basePath: controller.basePath,
          routes,
        });
      }
    }
    return list;
  }, [snapshot, query]);

  const totalRoutes = controllers.reduce((sum, c) => sum + c.routes.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-600 bg-surface-850 px-3 py-2 text-xs">
        <RouteIcon className="h-3.5 w-3.5 text-accent-400" />
        <span className="text-slate-400">Prefix:</span>
        <code className="rounded bg-surface-900 px-1.5 py-0.5 text-slate-200">
          /{globals?.prefix || ""}
        </code>
        {globals?.versioning && (
          <>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">Versioning:</span>
            <code className="rounded bg-surface-900 px-1.5 py-0.5 text-slate-200">
              {globals.versioning.type} (default{" "}
              {Array.isArray(globals.versioning.defaultVersion)
                ? globals.versioning.defaultVersion.join(", ")
                : globals.versioning.defaultVersion}
              )
            </code>
          </>
        )}
        <span className="ml-auto text-slate-600">{totalRoutes} routes</span>
      </div>

      {globals &&
        globals.guards.length +
          globals.interceptors.length +
          globals.pipes.length +
          globals.filters.length >
          0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-surface-600 bg-surface-850 px-3 py-2 text-[11px]">
            <span className="mr-1 text-slate-500">Global:</span>
            {globals.guards.map((g) => (
              <Badge key={g} tone="guard" label={g} />
            ))}
            {globals.interceptors.map((g) => (
              <Badge key={g} tone="interceptor" label={g} />
            ))}
            {globals.pipes.map((g) => (
              <Badge key={g} tone="pipe" label={g} />
            ))}
            {globals.filters.map((g) => (
              <Badge key={g} tone="filter" label={g} />
            ))}
          </div>
        )}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by path, method or controller…"
        className="w-full rounded-md border border-surface-600 bg-surface-850 px-3 py-2 text-sm font-mono focus:border-accent-500 focus:outline-none"
      />

      <div className="flex-1 overflow-auto rounded-lg border border-surface-600 bg-surface-850">
        {controllers.length === 0 ? (
          <EmptyState
            title="No routes found"
            hint="Try a different filter, or check that your controllers export @Get/@Post handlers."
          />
        ) : (
          <div className="divide-y divide-surface-700">
            {controllers.map((controller) => {
              const isOpen = openControllers[controller.name] ?? true;
              return (
                <div key={controller.name}>
                  <button
                    onClick={() =>
                      setOpenControllers((s) => ({
                        ...s,
                        [controller.name]: !isOpen,
                      }))
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-800"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                    )}
                    <span className="font-mono text-[13px] text-slate-100">
                      {controller.name}
                    </span>
                    <span className="text-[11px] text-slate-600">
                      {controller.module}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-600">
                      {controller.routes.length} routes
                    </span>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-surface-800/60 pb-1">
                      {controller.routes.map((route) => (
                        <RouteRow
                          key={`${route.method}-${route.path}`}
                          route={route}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RouteRow({ route }: { route: RouteNode }) {
  const [open, setOpen] = useState(false);
  const hasDetail =
    route.guards.length +
      route.interceptors.length +
      route.pipes.length +
      route.filters.length >
      0 || !!route.dto;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 pl-8",
          hasDetail && "cursor-pointer hover:bg-surface-800",
        )}
        onClick={() => hasDetail && setOpen((o) => !o)}
      >
        <MethodBadge method={route.method} />
        <span className="truncate font-mono text-[12.5px] text-slate-200">
          {route.path}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {route.guards.length > 0 && (
            <Pill
              icon={<ShieldCheck className="h-3 w-3" />}
              count={route.guards.length}
              tone="text-amber-400"
            />
          )}
          {route.interceptors.length > 0 && (
            <Pill
              icon={<Layers className="h-3 w-3" />}
              count={route.interceptors.length}
              tone="text-sky-400"
            />
          )}
          {route.pipes.length > 0 && (
            <Pill
              icon={<Wand2 className="h-3 w-3" />}
              count={route.pipes.length}
              tone="text-violet-400"
            />
          )}
          {route.filters.length > 0 && (
            <Pill
              icon={<FilterIcon className="h-3 w-3" />}
              count={route.filters.length}
              tone="text-rose-400"
            />
          )}
          <CopyButton value={route.path} />
        </span>
      </div>
      {open && hasDetail && (
        <div className="ml-8 mr-3 mb-2 rounded-md border border-surface-700 bg-surface-900 p-3 text-[11px]">
          <div className="flex flex-wrap gap-1.5">
            {route.guards.map((g) => (
              <Badge key={g} tone="guard" label={g} />
            ))}
            {route.interceptors.map((g) => (
              <Badge key={g} tone="interceptor" label={g} />
            ))}
            {route.pipes.map((g) => (
              <Badge key={g} tone="pipe" label={g} />
            ))}
            {route.filters.map((g) => (
              <Badge key={g} tone="filter" label={g} />
            ))}
          </div>
          {route.dto && (
            <div className="mt-2.5 border-t border-surface-800 pt-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-slate-400">
                <span className="text-[10px] uppercase tracking-wider">
                  Body DTO
                </span>
                <code className="rounded bg-surface-800 px-1 py-0.5 text-slate-200">
                  {route.dto.name}
                </code>
              </div>
              {route.dto.fields.length === 0 ? (
                <p className="text-slate-600">
                  Shape not detectable (install <code>class-validator</code> in
                  the host app, or add validation decorators to the DTO).
                </p>
              ) : (
                <table className="w-full font-mono text-[11px]">
                  <tbody>
                    {route.dto.fields.map((field) => (
                      <tr
                        key={field.name}
                        className="border-t border-surface-800/70"
                      >
                        <td className="py-1 pr-3 text-slate-200">
                          {field.name}
                          {!field.optional && (
                            <span className="text-rose-400">*</span>
                          )}
                        </td>
                        <td className="py-1 pr-3 text-sky-300">{field.type}</td>
                        <td className="py-1 text-slate-600">
                          {field.rules.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TONES: Record<string, string> = {
  guard: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  interceptor: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  pipe: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  filter: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

function Badge({ label, tone }: { label: string; tone: keyof typeof TONES }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[10.5px]",
        TONES[tone],
      )}
    >
      {label}
    </span>
  );
}

function Pill({
  icon,
  count,
  tone,
}: {
  icon: ReactNode;
  count: number;
  tone: string;
}) {
  return (
    <span className={cn("flex items-center gap-0.5 text-[10.5px]", tone)}>
      {icon}
      {count}
    </span>
  );
}
