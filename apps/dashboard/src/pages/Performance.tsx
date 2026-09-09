import { useEffect, useMemo, useState } from 'react';
import { Activity, Cpu, Gauge, MemoryStick, Timer } from 'lucide-react';
import type { PerformanceSnapshot } from '@angelitosystems/devtools-protocol';
import type { DevToolsState } from '../store/store';
import { cn, formatBytes, formatDuration } from '../lib/utils';

/** Live ring buffer of recent performance points per project. */
const history = new Map<string, PerformanceSnapshot[]>();

export default function PerformancePage({ store }: { store: DevToolsState }) {
  const latest = Object.values(store.performance)[0];

  useEffect(() => {
    if (!latest) return;
    const points = history.get(latest.projectId) ?? [];
    points.push(latest);
    if (points.length > 120) points.shift();
    history.set(latest.projectId, points);
  }, [latest]);

  const points = latest ? history.get(latest.projectId) ?? [] : [];

  if (!latest) {
    return (
      <div className="p-10 text-center text-sm text-slate-500">
        Waiting for performance data — connects automatically once an app links the SDK.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <GaugeCard icon={<Cpu className="h-4 w-4 text-accent-400" />} label="CPU" value={`${latest.cpuPercent}%`} percent={latest.cpuPercent} />
        <GaugeCard
          icon={<MemoryStick className="h-4 w-4 text-accent-400" />}
          label="Memory (RSS)"
          value={formatBytes(latest.memoryUsedBytes)}
          percent={Math.round((latest.heapUsedBytes / Math.max(latest.heapTotalBytes, 1)) * 100)}
        />
        <GaugeCard
          icon={<Timer className="h-4 w-4 text-accent-400" />}
          label="Event loop lag"
          value={`${latest.eventLoopLagMs}ms`}
          percent={Math.min(100, latest.eventLoopLagMs * 10)}
        />
        <GaugeCard
          icon={<Activity className="h-4 w-4 text-accent-400" />}
          label="Req/s"
          value={String(latest.requestsPerSecond)}
          percent={Math.min(100, latest.requestsPerSecond)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="CPU %" data={points.map((p) => p.cpuPercent)} color="#0ea5e9" />
        <ChartCard title="Heap used" data={points.map((p) => p.heapUsedBytes / 1024 / 1024)} color="#a78bfa" unit="MB" />
        <ChartCard title="Latency p95 (ms)" data={points.map((p) => p.p95LatencyMs)} color="#f59e0b" />
        <ChartCard title="Event loop lag (ms)" data={points.map((p) => p.eventLoopLagMs)} color="#34d399" />
      </div>

      <div className="bg-surface-850 border border-surface-600 rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3">Latency percentiles</h3>
        <div className="grid grid-cols-3 gap-4 font-mono text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Average</div>
            <div className="text-slate-100">{formatDuration(latest.averageLatencyMs)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">p95</div>
            <div className="text-amber-300">{formatDuration(latest.p95LatencyMs)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">p99</div>
            <div className="text-rose-300">{formatDuration(latest.p99LatencyMs)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GaugeCard({ icon, label, value, percent }: { icon: React.ReactNode; label: string; value: string; percent: number }) {
  return (
    <div className="bg-surface-850 border border-surface-600 rounded-lg p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
      <div className="mt-2 h-1.5 bg-surface-700 rounded">
        <div
          className={cn('h-1.5 rounded transition-all', percent > 80 ? 'bg-rose-500' : percent > 60 ? 'bg-amber-400' : 'bg-accent-500')}
          style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
        />
      </div>
    </div>
  );
}

/** Dependency-free sparkline chart. */
function ChartCard({ title, data, color, unit }: { title: string; data: number[]; color: string; unit?: string }) {
  const path = useMemo(() => sparkline(data, 280, 60), [data]);
  return (
    <div className="bg-surface-850 border border-surface-600 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="font-mono text-xs text-slate-500">
          {data.length > 0 ? `${round(data[data.length - 1])}${unit ? ` ${unit}` : ''}` : '—'}
        </span>
      </div>
      <svg viewBox="0 0 280 60" className="w-full h-16">
        <polyline
          points={path}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function sparkline(data: number[], width: number, height: number): string {
  if (data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function round(value: number): string {
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}
