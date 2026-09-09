import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, NavLink, useParams, useNavigate, Link } from 'react-router-dom';
import { categories, pages, pageBySlug } from './markdown/loader';
import { renderMarkdown } from './markdown/renderer';

const SLUG_MAP = new Set(pages.map((page) => page.slug));

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const intro = pageBySlug('readme') ?? pages[0];

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">ND</span>
          NestJS DevTools <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>Docs</span>
        </Link>
        <div className="topbar-search">
          <button
            onClick={() => setSearchOpen(true)}
            style={{
              width: '100%', textAlign: 'left', padding: '7px 12px 7px 32px',
              background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 8,
              color: 'var(--text-faint)', fontSize: 13, cursor: 'pointer', position: 'relative',
            }}
          >
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>⌕</span>
            Search docs…
            <kbd style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>Ctrl K</kbd>
          </button>
        </div>
        <nav className="topbar-links">
          <Link to="/docs/quick-start">Quick start</Link>
          <Link to="/docs/cli">CLI</Link>
          <a href="https://github.com/angelitosystems/nest-devtools" target="_blank" rel="noreferrer">GitHub ↗</a>
        </nav>
      </header>

      <div className="layout">
        <aside className="sidebar">
          {categories.map((category) => (
            <div key={category.name}>
              <div className="nav-category">{category.name}</div>
              {category.pages.map((page) => (
                <NavLink
                  key={page.slug}
                  to={`/docs/${page.slug}`}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                  {page.title.replace(/^NestJS DevTools\s*/i, '') || page.slug}
                </NavLink>
              ))}
            </div>
          ))}
        </aside>

        <main className="content">
          <Routes>
            <Route path="/" element={<Home intro={intro} />} />
            <Route path="/docs" element={<Home intro={intro} />} />
            <Route path="/docs/:slug" element={<DocPageView />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- home page

function Home({ intro }: { intro: NonNullable<ReturnType<typeof pageBySlug>> }) {
  useEffect(() => {
    document.title = 'NestJS DevTools · Docs';
  }, []);
  return (
    <article className="doc">
      <DocBody slug={intro.slug} content={intro.content} file={intro.file} />
    </article>
  );
}

// ------------------------------------------------------------- doc page

function DocPageView() {
  const { slug } = useParams();
  const page = pageBySlug((slug ?? '').toLowerCase());

  useEffect(() => {
    if (page) document.title = `${page.title} · NestJS DevTools`;
    window.scrollTo(0, 0);
  }, [page]);

  if (!page) return <NotFound />;

  const index = pages.findIndex((candidate) => candidate.slug === page.slug);
  const prev = index > 0 ? pages[index - 1] : undefined;
  const next = index >= 0 && index < pages.length - 1 ? pages[index + 1] : undefined;

  return (
    <div className="with-toc">
      <article className="doc">
        <DocBody slug={page.slug} content={page.content} file={page.file} />
        <nav className="pager">
          {prev ? (
            <Link to={`/docs/${prev.slug}`} className="prev">
              <div className="pager-label">Previous</div>
              <div className="pager-title">{prev.title}</div>
            </Link>
          ) : <span />}
          {next && (
            <Link to={`/docs/${next.slug}`} className="next">
              <div className="pager-label">Next</div>
              <div className="pager-title">{next.title}</div>
            </Link>
          )}
        </nav>
      </article>
      <TableOfContents content={page.content} />
    </div>
  );
}

function DocBody({ slug, content, file }: { slug: string; content: string; file: string }) {
  const html = useMemo(() => renderMarkdown(content, SLUG_MAP), [content]);

  // in-app links: intercept to set hash routing
  const onClick = (event: React.MouseEvent) => {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('/docs/')) {
      event.preventDefault();
      window.location.hash = `#${href}`;
    }
  };

  return (
    <div onClick={onClick} data-slug={slug}>
      <div className="file-banner">docs/{file}</div>
      {html}
    </div>
  );
}

// ------------------------------------------------------------------- toc

function TableOfContents({ content }: { content: string }) {
  const headings = useMemo(() => {
    const result: Array<{ level: number; text: string; id: string }> = [];
    for (const line of content.split('\n')) {
      const match = /^(#{2,3})\s+(.+)$/.exec(line);
      if (match) {
        const text = match[2].replace(/[`*]/g, '');
        result.push({
          level: match[1].length,
          text,
          id: text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-'),
        });
      }
    }
    return result;
  }, [content]);

  if (headings.length < 2) return null;

  return (
    <nav className="toc">
      <div className="toc-title">On this page</div>
      {headings.map((heading) => (
        <a key={heading.id} href={`#${heading.id}`} className={heading.level === 3 ? 'lvl3' : ''}>
          {heading.text}
        </a>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------- search

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term === '') return pages.slice(0, 8);
    return pages
      .map((page) => {
        const titleHit = page.title.toLowerCase().includes(term) ? 2 : 0;
        const excerptHit = page.excerpt.toLowerCase().includes(term) ? 1 : 0;
        const contentHit = page.content.toLowerCase().includes(term) ? 1 : 0;
        return { page, score: titleHit + excerptHit + contentHit };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((entry) => entry.page);
  }, [query]);

  const go = (slug: string) => {
    navigate(`/docs/${slug}`);
    onClose();
  };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documentation…"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) go(results[0].slug);
          }}
        />
        <div className="search-results">
          {results.length === 0 && <div className="search-empty">No results for “{query}”</div>}
          {results.map((page) => (
            <a key={page.slug} className="search-result" href={`#/docs/${page.slug}`} onClick={() => go(page.slug)}>
              <div className="sr-title">{page.title}</div>
              <div className="sr-excerpt">{page.excerpt}</div>
            </a>
          ))}
        </div>
        <div className="search-hint">
          <span><kbd>Enter</kbd> open first result</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- not found

function NotFound() {
  return (
    <article className="doc">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist in the docs.</p>
      <p>
        <Link to="/">← Back to the documentation home</Link>
      </p>
    </article>
  );
}
