import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Inbox } from 'lucide-react';
import { cn, methodBadgeClasses } from '../lib/utils';

/** Colored pill for an HTTP method (GET/POST/…), sized like Postman's. */
export function MethodBadge({ method, className }: { method: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-semibold font-mono tracking-tight w-[52px] shrink-0',
        methodBadgeClasses(method),
        className,
      )}
    >
      {method.toUpperCase()}
    </span>
  );
}

/** Small colored dot + number, used for status codes in dense rows. */
export function StatusChip({ status }: { status: number }) {
  const tone =
    status >= 500 ? 'text-rose-400' : status >= 400 ? 'text-amber-400' : status >= 300 ? 'text-sky-300' : 'text-emerald-400';
  return <span className={cn('font-mono text-xs font-medium', tone)}>{status}</span>;
}

/** Copy-to-clipboard icon button with a brief checkmark confirmation. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // clipboard unavailable — silently ignore
        }
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-surface-700 hover:text-slate-100 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

/** Underline tab strip, Postman-style, with optional per-tab counts. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-surface-700 px-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative py-2 text-[12.5px] font-medium transition-colors',
            active === tab.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300',
          )}
        >
          <span className="flex items-center gap-1.5">
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="rounded-full bg-surface-700 px-1.5 text-[10px] text-slate-400">{tab.count}</span>
            )}
          </span>
          {active === tab.id && <span className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-accent-500" />}
        </button>
      ))}
    </div>
  );
}

/** Centered placeholder for empty lists/panels. */
export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 py-14 text-center">
      <div className="mb-1 text-slate-600">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <div className="text-sm text-slate-400">{title}</div>
      {hint && <div className="max-w-xs text-xs text-slate-600">{hint}</div>}
    </div>
  );
}

/** Two-pane layout with a mouse-draggable divider, like Postman's request/response split. */
export function SplitPane({
  left,
  right,
  defaultLeftWidth = 480,
  minLeft = 320,
  minRight = 340,
}: {
  left: ReactNode;
  right: ReactNode;
  defaultLeftWidth?: number;
  minLeft?: number;
  minRight?: number;
}) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = Math.min(rect.width - minRight, Math.max(minLeft, event.clientX - rect.left));
      setLeftWidth(next);
    }
    function onUp() {
      dragging.current = false;
      setActive(false);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [minLeft, minRight]);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 min-w-0 flex-1">
      <div style={{ width: leftWidth }} className="flex min-w-0 shrink-0 flex-col">
        {left}
      </div>
      <div
        className={cn('pane-resizer', active && 'active')}
        onMouseDown={() => {
          dragging.current = true;
          setActive(true);
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{right}</div>
    </div>
  );
}

/** Recursively rendered, collapsible JSON tree — the Postman/DevTools "pretty" view. */
export function JsonView({ value, name, depth = 0 }: { value: unknown; name?: string; depth?: number }) {
  if (value === null || value === undefined) {
    return <JsonLeaf name={name} value={value === null ? 'null' : 'undefined'} tone="text-slate-600" />;
  }
  if (typeof value === 'string') {
    return <JsonLeaf name={name} value={`"${value}"`} tone="text-emerald-300" />;
  }
  if (typeof value === 'number') {
    return <JsonLeaf name={name} value={String(value)} tone="text-sky-300" />;
  }
  if (typeof value === 'boolean') {
    return <JsonLeaf name={name} value={String(value)} tone="text-accent-400" />;
  }
  if (Array.isArray(value)) {
    return (
      <JsonBranch name={name} depth={depth} openBracket="[" closeBracket="]" count={value.length}>
        {value.map((item, index) => (
          <JsonView key={index} value={item} name={String(index)} depth={depth + 1} />
        ))}
      </JsonBranch>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <JsonBranch name={name} depth={depth} openBracket="{" closeBracket="}" count={entries.length}>
        {entries.map(([key, item]) => (
          <JsonView key={key} value={item} name={key} depth={depth + 1} />
        ))}
      </JsonBranch>
    );
  }
  return <JsonLeaf name={name} value={String(value)} tone="text-slate-400" />;
}

function JsonLeaf({ name, value, tone }: { name?: string; value: string; tone: string }) {
  return (
    <div className="whitespace-pre font-mono text-[12px] leading-5">
      {name !== undefined && <span className="text-slate-500">"{name}": </span>}
      <span className={tone}>{value}</span>
    </div>
  );
}

function JsonBranch({
  name,
  depth,
  openBracket,
  closeBracket,
  count,
  children,
}: {
  name?: string;
  depth: number;
  openBracket: string;
  closeBracket: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(depth < 2);
  if (count === 0) {
    return (
      <div className="whitespace-pre font-mono text-[12px] leading-5">
        {name !== undefined && <span className="text-slate-500">"{name}": </span>}
        <span className="text-slate-600">
          {openBracket}
          {closeBracket}
        </span>
      </div>
    );
  }
  return (
    <div className="font-mono text-[12px] leading-5">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 whitespace-pre text-left hover:bg-surface-700/60 rounded">
        <span className="inline-block w-3 text-slate-600">{open ? '▾' : '▸'}</span>
        {name !== undefined && <span className="text-slate-500">"{name}": </span>}
        <span className="text-slate-600">
          {openBracket}
          {!open && <span className="mx-1 text-slate-700">{count} items</span>}
          {open ? '' : closeBracket}
        </span>
      </button>
      {open && (
        <div className="ml-4 border-l border-surface-700 pl-3">
          {children}
          <div className="text-slate-600">{closeBracket}</div>
        </div>
      )}
    </div>
  );
}
