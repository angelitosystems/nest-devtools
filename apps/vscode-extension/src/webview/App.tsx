import { useEffect, useMemo, useState } from 'react';

type Section = 'overview' | 'requests' | 'logs' | 'errors' | 'database' | 'performance';
type Snapshot = {
  projects: Array<{ projectId: string; projectName: string; environment: string; pid: number }>;
  requests: Array<{ requestId: string; projectId: string; method: string; url: string; statusCode: number; duration: number; startedAt: number }>;
  logs: Array<{ projectId: string; level: string; message: string; timestamp: number }>;
  errors: Array<{ projectId: string; name: string; message: string; timestamp: number }>;
  queries: Array<{ projectId: string; provider: string; sql: string; duration: number; timestamp: number }>;
  performance: Record<string, { cpuPercent: number; heapUsedBytes: number; heapTotalBytes: number; p95LatencyMs: number; requestsPerSecond: number }>;
};

const empty: Snapshot = { projects: [], requests: [], logs: [], errors: [], queries: [], performance: {} };
const serverUrl = document.body.dataset.serverUrl ?? 'http://localhost:4317';

export default function App() {
  const [section, setSection] = useState<Section>('overview');
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let alive = true;
    const base = serverUrl.replace(/\/$/, '');
    const load = async () => {
      try {
        const response = await fetch(`${base}/api/state`);
        const body = await response.json() as { snapshot?: Snapshot };
        if (alive && body.snapshot) { setSnapshot(normalize(body.snapshot)); setConnected(true); }
      } catch { if (alive) setConnected(false); }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    const wsUrl = base.replace(/^http/, 'ws') + '/ws?client=dashboard';
    let socket: WebSocket | undefined;
    try {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => setConnected(true);
      socket.onclose = () => setConnected(false);
      socket.onmessage = (event) => {
        try { applyEvent(JSON.parse(event.data) as { event: string; payload: any }, setSnapshot); } catch { /* ignore malformed event */ }
      };
    } catch { /* polling remains available */ }
    return () => { alive = false; window.clearInterval(timer); socket?.close(); };
  }, []);

  const visible = useMemo(() => {
    const term = filter.toLowerCase();
    if (!term) return snapshot;
    return {
      ...snapshot,
      requests: snapshot.requests.filter((item) => `${item.method} ${item.url} ${item.statusCode}`.toLowerCase().includes(term)),
      logs: snapshot.logs.filter((item) => item.message.toLowerCase().includes(term) || item.level.includes(term)),
      errors: snapshot.errors.filter((item) => `${item.name} ${item.message}`.toLowerCase().includes(term)),
      queries: snapshot.queries.filter((item) => `${item.provider} ${item.sql}`.toLowerCase().includes(term)),
    };
  }, [snapshot, filter]);

  const latestPerformance = Object.values(snapshot.performance)[0];
  const requestSeries = snapshot.requests.slice(-24).map((item) => item.duration);

  return <div className="app">
    <header className="topbar">
      <div className="brand"><div className="brand-icon">N</div><div><span className="eyebrow">NestJS observability</span><h1>DevTools</h1></div></div>
      <div className={connected ? 'connection live' : 'connection'}><i />{connected ? 'Live' : 'Offline'}</div>
    </header>
    <nav className="tabs">{(['overview', 'requests', 'logs', 'errors', 'database', 'performance'] as Section[]).map((item) => <button className={section === item ? 'active' : ''} onClick={() => setSection(item)} key={item}>{item}</button>)}</nav>
    <main>
      {section === 'overview' && <Overview snapshot={snapshot} performance={latestPerformance} series={requestSeries} onNavigate={setSection} />}
      {section === 'requests' && <DataTable title="Requests" columns={['Method', 'URL', 'Status', 'Duration']} rows={visible.requests.slice(-100).reverse().map((item) => [item.method, item.url, String(item.statusCode), `${item.duration} ms`])} filter={filter} onFilter={setFilter} />}
      {section === 'logs' && <DataTable title="Logs" columns={['Level', 'Message', 'Time']} rows={visible.logs.slice(-100).reverse().map((item) => [item.level, item.message, time(item.timestamp)])} filter={filter} onFilter={setFilter} />}
      {section === 'errors' && <DataTable title="Errors" columns={['Name', 'Message', 'Time']} rows={visible.errors.slice(-100).reverse().map((item) => [item.name, item.message, time(item.timestamp)])} filter={filter} onFilter={setFilter} />}
      {section === 'database' && <DataTable title="Database queries" columns={['Provider', 'SQL', 'Duration']} rows={visible.queries.slice(-100).reverse().map((item) => [item.provider, item.sql, `${item.duration} ms`])} filter={filter} onFilter={setFilter} />}
      {section === 'performance' && <Performance performance={latestPerformance} series={requestSeries} />}
    </main>
  </div>;
}

function Overview({ snapshot, performance, series, onNavigate }: { snapshot: Snapshot; performance?: Snapshot['performance'][string]; series: number[]; onNavigate: (section: Section) => void }) {
  return <>
    <section className="hero"><div><span className="eyebrow">Live workspace</span><h2>Everything is observable.</h2><p>Watch your NestJS application while you build. Events arrive directly over WebSocket.</p></div><Sparkline data={series} /></section>
    <div className="metrics"><Metric label="Projects" value={snapshot.projects.length} note="connected" /><Metric label="Requests" value={snapshot.requests.length} note="captured" /><Metric label="Errors" value={snapshot.errors.length} note="needs attention" danger={snapshot.errors.length > 0} /><Metric label="P95 latency" value={performance ? `${Math.round(performance.p95LatencyMs)}ms` : '—'} note="latest sample" /></div>
    <div className="columns"><Panel title="Projects" action="View" onClick={() => onNavigate('overview')}><div className="project-list">{snapshot.projects.length === 0 ? <Empty text="Waiting for a connected NestJS app" /> : snapshot.projects.map((project) => <div className="project" key={project.projectId}><span className="status-dot" /><div><b>{project.projectName}</b><small>{project.environment} · PID {project.pid}</small></div><span className="tag">online</span></div>)}</div></Panel><Panel title="Recent activity" action="Logs" onClick={() => onNavigate('logs')}><div className="activity">{snapshot.logs.slice(-7).reverse().map((log, index) => <div className="activity-row" key={`${log.timestamp}-${index}`}><b className={log.level}>{log.level}</b><span>{log.message}</span></div>)}{snapshot.logs.length === 0 && <Empty text="No logs captured yet" />}</div></Panel></div>
  </>;
}

function Performance({ performance, series }: { performance?: Snapshot['performance'][string]; series: number[] }) {
  return <><section className="section-head"><div><span className="eyebrow">Runtime signals</span><h2>Performance</h2></div><span className="tag">updates live</span></section><div className="metrics"><Metric label="CPU" value={performance ? `${Math.round(performance.cpuPercent)}%` : '—'} note="process" /><Metric label="Heap" value={performance ? `${Math.round(performance.heapUsedBytes / 1024 / 1024)} MB` : '—'} note="used" /><Metric label="Requests / sec" value={performance?.requestsPerSecond ?? '—'} note="throughput" /></div><div className="chart-panel"><div className="chart-title"><b>Request duration</b><span>last {series.length} samples</span></div><Sparkline data={series} large /></div></>;
}

function DataTable({ title, columns, rows, filter, onFilter }: { title: string; columns: string[]; rows: string[][]; filter: string; onFilter: (value: string) => void }) {
  return <section><div className="section-head"><div><span className="eyebrow">Live stream</span><h2>{title}</h2></div><input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="Filter events..." /></div><div className="table-panel">{rows.length === 0 ? <Empty text="No events match this view" /> : <table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td className={cellIndex === 0 ? 'accent' : ''} key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>}</div></section>;
}

function Panel({ title, action, onClick, children }: { title: string; action: string; onClick: () => void; children: React.ReactNode }) { return <section className="panel"><div className="panel-head"><h3>{title}</h3><button onClick={onClick}>{action} →</button></div>{children}</section>; }
function Metric({ label, value, note, danger }: { label: string; value: string | number; note: string; danger?: boolean }) { return <div className={danger ? 'metric danger' : 'metric'}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function Sparkline({ data, large = false }: { data: number[]; large?: boolean }) { const width = 360; const height = large ? 150 : 70; const max = Math.max(...data, 1); const points = data.length > 1 ? data.map((value, index) => `${(index / (data.length - 1)) * width},${height - (value / max) * (height - 8) - 4}`).join(' ') : ''; return <svg className={large ? 'sparkline large' : 'sparkline'} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Live request duration chart"><polyline points={points} /></svg>; }
function normalize(snapshot: Snapshot): Snapshot { return { ...empty, ...snapshot, projects: snapshot.projects ?? [], requests: snapshot.requests ?? [], logs: snapshot.logs ?? [], errors: snapshot.errors ?? [], queries: snapshot.queries ?? [], performance: snapshot.performance ?? {} }; }
function applyEvent(message: { event: string; payload: any }, setSnapshot: (update: (previous: Snapshot) => Snapshot) => void): void { setSnapshot((previous) => { const next = { ...previous }; if (message.event === 'state.snapshot') return normalize(message.payload); if (message.event === 'request.completed') next.requests = [...previous.requests.slice(-499), message.payload]; if (message.event === 'log.created') next.logs = [...previous.logs.slice(-1999), message.payload]; if (message.event === 'error.created') next.errors = [...previous.errors.slice(-499), message.payload]; if (message.event === 'query.executed') next.queries = [...previous.queries.slice(-1999), message.payload]; if (message.event === 'performance.updated') next.performance = { ...previous.performance, [message.payload.projectId]: message.payload }; return next; }); }
function time(value: number): string { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
