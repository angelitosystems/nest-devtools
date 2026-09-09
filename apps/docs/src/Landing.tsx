import { useState } from 'react';
import { Link } from 'react-router-dom';

const features = [
  ['requests', 'Requests', 'Metodo, URL, status, duracion, query, IP y user agent de cada request HTTP.'],
  ['logs', 'Logs', 'console.* y Logger de NestJS con archivo, linea y contexto de la peticion.'],
  ['errors', 'Errores', 'Stacks, ubicacion exacta del codigo y agrupacion de errores repetidos.'],
  ['perf', 'Performance', 'CPU, memoria, heap, event-loop lag, req/s y percentiles p95/p99.'],
  ['app', 'Aplicacion', 'Modulos, controllers, providers, guards, interceptores y pipes.'],
  ['src', 'Source locations', 'Enlaces directos a la linea exacta en VS Code y Cursor.'],
] as const;

const roadmap = [
  ['v0.1', 'SDK, WebSocket, logs, HTTP, errores y dashboard', true],
  ['v0.2', 'NestJS explorer, request timeline y source locations', false],
  ['v0.3', 'Database, WebSockets, eventos y colas', false],
  ['v0.4', 'Extension VS Code, Cursor y command palette', false],
  ['v1.0', 'Protocolo estable, plugins, profiling y OpenTelemetry', false],
] as const;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return <button className="copy-button" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>;
}

function CodeBlock({ label, children, copy }: { label: string; children: React.ReactNode; copy?: string }) {
  return (
    <div className="code-block">
      <div className="code-head"><span>{label}</span>{copy && <CopyButton value={copy} />}</div>
      <pre><code>{children}</code></pre>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="landing-shell">
      <div className="top-ticker" aria-label="Anuncios de Angelito Systems">
        <div className="top-ticker-track">
          <span>Hecho con <span aria-hidden="true">♥</span> por <strong>Angelito Systems</strong></span>
          <span>Observabilidad en tiempo real para NestJS</span>
          <span>Un paquete · una linea · un dashboard en vivo</span>
          <span>Funciona con Node.js, Bun y NestJS 9, 10, 11 y 12</span>
          <span>Hecho con <span aria-hidden="true">♥</span> por <strong>Angelito Systems</strong></span>
          <span>Observabilidad en tiempo real para NestJS</span>
          <span>Un paquete · una linea · un dashboard en vivo</span>
          <span>Funciona con Node.js, Bun y NestJS 9, 10, 11 y 12</span>
        </div>
      </div>

      <header className="landing-topbar">
        <a className="brand" href="#inicio" onClick={(event) => { event.preventDefault(); scrollToSection('inicio'); }}>
          <span className="brand-mark">ND</span>
          <span>NestJS DevTools</span>
        </a>
        <nav className="topnav" aria-label="Navegacion principal">
          <a href="#caracteristicas" onClick={(event) => { event.preventDefault(); scrollToSection('caracteristicas'); }}>Caracteristicas</a>
          <a href="#instalacion" onClick={(event) => { event.preventDefault(); scrollToSection('instalacion'); }}>Instalacion</a>
          <a href="#configuracion" onClick={(event) => { event.preventDefault(); scrollToSection('configuracion'); }}>Configuracion</a>
          <Link className="nav-link" to="/docs/quick-start">Docs <span className="ext">↗</span></Link>
        </nav>
      </header>

      <main>
        <section className="hero" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" />NestJS · Node.js &amp; Bun · v0.1.0</p>
            <h1>Ve lo que pasa dentro de tu app <span className="accent">mientras pasa</span></h1>
            <p className="hero-text">NestJS DevTools instrumenta tu aplicacion y transmite requests, logs, errores y metricas a un dashboard local en tiempo real. Una linea en <code>main.ts</code>. Si el servidor esta apagado, tu app arranca igual.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#instalacion" onClick={(event) => { event.preventDefault(); scrollToSection('instalacion'); }}>Empezar ahora</a>
              <Link className="button button-secondary" to="/docs/quick-start">Guia rapida <span className="ext">↗</span></Link>
            </div>
            <div className="install-line"><span>$</span> bun add @angelitosystems/nest-devtools <CopyButton value="bun add @angelitosystems/nest-devtools" /></div>
          </div>

          <div className="hero-panel" aria-label="Vista previa del dashboard">
            <div className="panel-bar"><span className="dot dot-red" /><span className="dot dot-amber" /><span className="dot dot-green" /><span className="panel-title">localhost:4317</span><span className="panel-status">● Online</span></div>
            <div className="panel-body">
              <div className="panel-row"><span className="method get">GET</span><span className="url">/cats</span><span className="status ok">200</span><span className="ms">42ms</span></div>
              <div className="panel-row"><span className="method post">POST</span><span className="url">/auth/login</span><span className="status ok">201</span><span className="ms">81ms</span></div>
              <div className="panel-row"><span className="method get">GET</span><span className="url">/users/999</span><span className="status err">500</span><span className="ms">64ms</span></div>
              <div className="panel-log"><span className="time">14:32:10</span><span className="lvl info">INFO</span> UsersService · User created</div>
              <div className="panel-log"><span className="time">14:32:12</span><span className="lvl err">ERROR</span> TypeError: undefined is not a function</div>
              <div className="panel-metrics"><div><strong>124</strong><span>req/s</span></div><div><strong>183ms</strong><span>p95</span></div><div><strong>72%</strong><span>CPU</span></div><div><strong>48%</strong><span>heap</span></div></div>
            </div>
          </div>
        </section>

        <section className="signal-strip" aria-label="Resumen del producto">
          <div><strong>1 linea</strong><span>NestDevTools.init(app)</span></div><div><strong>Tiempo real</strong><span>WebSocket, sin polling</span></div><div><strong>Multi-proyecto</strong><span>varias apps, un dashboard</span></div><div><strong>Cero riesgo</strong><span>nunca bloquea tu app</span></div>
        </section>

        <div className="landing-content">
          <section className="doc-section" id="instalacion"><p className="section-kicker">Primeros pasos</p><h2>Instala el SDK</h2><p>Un unico paquete para cualquier proyecto NestJS, sin agentes ni infraestructura adicional.</p><CodeBlock label="terminal" copy="bun add @angelitosystems/nest-devtools">bun add @angelitosystems/nest-devtools{`\n`}<span className="cmt"># npm install @angelitosystems/nest-devtools</span></CodeBlock></section>
          <section className="doc-section" id="inicio-rapido"><p className="section-kicker">Primeros pasos</p><h2>Tu primera sesion de debugging</h2><p>Agrega una linea a <code>main.ts</code>, arranca el servidor y abre el dashboard.</p><CodeBlock label="src/main.ts">{`import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\nimport { NestDevTools } from '@angelitosystems/nest-devtools';\n\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  NestDevTools.init(app);\n  await app.listen(3000);\n}\nbootstrap();`}</CodeBlock><CodeBlock label="terminal" copy="npx @angelitosystems/nest-devtools-cli">npx @angelitosystems/nest-devtools-cli{`\n\n`}<span className="cmt">✓ Dashboard available → http://localhost:4317</span></CodeBlock><p>Haz requests a tu API y miralos aparecer al instante junto con sus logs y errores correlacionados por <code>requestId</code>.</p></section>
          <section className="doc-section" id="caracteristicas"><p className="section-kicker">Caracteristicas</p><h2>Que captura DevTools</h2><div className="feature-grid">{features.map(([kind, title, text]) => <article className="feature-card" key={kind}><h3><span className={`chip ${kind}`}><i />{title}</span></h3><p>{text}</p></article>)}</div></section>
          <section className="doc-section" id="dashboard"><p className="section-kicker">Caracteristicas</p><h2>El dashboard</h2><ul className="check-list"><li><strong>Overview</strong> — estado y feeds en vivo.</li><li><strong>Requests</strong> — tabla buscable y detalle por request.</li><li><strong>Logs</strong> — filtros, busqueda y pausa del stream.</li><li><strong>Errors</strong> — agrupados por huella y ocurrencias.</li><li><strong>Performance</strong> — CPU, heap y latencia en tiempo real.</li></ul></section>
          <section className="doc-section" id="configuracion"><p className="section-kicker">Configuracion</p><h2>Opciones de inicializacion</h2><p>Los valores por defecto estan pensados para desarrollo local.</p><CodeBlock label="src/main.ts">{`NestDevTools.init(app, {\n  server: 'ws://localhost:4318',\n  project: 'my-api',\n  environment: 'development',\n  redact: ['cardNumber', 'cvv'],\n  allow: ['publicToken'],\n  capture: { requests: true, logs: true, errors: true, performance: true },\n});`}</CodeBlock></section>
          <section className="doc-section" id="seguridad"><p className="section-kicker">Operacion</p><h2>Seguridad por diseno</h2><p>Nada sale de tu proceso sin pasar por el motor de redaccion. Passwords, tokens, autorizaciones, cookies y claves privadas se reemplazan por <code>[REDACTED]</code>.</p><ul className="check-list"><li>Headers sensibles nunca se capturan sin una whitelist segura.</li><li>Denylist con coincidencia parcial y allowlist para excepciones.</li><li>Todo vive en memoria en el servidor y el dashboard es local.</li></ul></section>
          <section className="doc-section" id="roadmap"><p className="section-kicker">Proyecto</p><h2>Roadmap</h2><table className="doc-table"><thead><tr><th>Version</th><th>Entregable</th></tr></thead><tbody>{roadmap.map(([version, text, done]) => <tr key={version}><td><span className={`chip ${done ? 'done' : 'next'}`}><i />{version}</span></td><td>{text}</td></tr>)}</tbody></table></section>
        </div>
      </main>

      <footer className="footer"><p><strong>NestJS DevTools</strong> — un producto de <strong>Angelito Systems</strong></p><p className="footer-links"><Link to="/docs/quick-start">Docs</Link> · <Link to="/docs/security">Seguridad</Link> · <Link to="/docs/architecture">Arquitectura</Link></p><p className="footer-legal">MIT License © 2026 Angelito Systems</p></footer>
    </div>
  );
}
