/**
 * Markdown loader.
 *
 * `import.meta.glob` with `query: '?raw'` inlines the full content of every
 * docs/*.md file into the bundle at build time — no runtime fetches, no
 * redirects, works on GitHub Pages as a pure static SPA.
 */
const modules = import.meta.glob('../../../docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface DocPage {
  /** URL slug, e.g. 'quick-start' */
  slug: string;
  /** File title derived from the first `# ` heading or the filename */
  title: string;
  /** First paragraph — used as the subtitle in navigation */
  excerpt: string;
  /** Full raw markdown content */
  content: string;
  /** Path relative to the docs folder, e.g. 'guides/quick-start.md' */
  file: string;
  /** Category inferred from front-matter `category:` or the section map */
  category: string;
  /** Sort order inside the category */
  order: number;
}

/** Curated section/sort order for known files (unknown files go to 'More'). */
const SECTIONS: Array<{ match: RegExp; category: string; order: number }> = [
  { match: /\/README\.md$/, category: 'Introduction', order: 0 },
  { match: /\/installation\.md$/, category: 'Getting started', order: 1 },
  { match: /\/quick-start\.md$/, category: 'Getting started', order: 2 },
  { match: /\/configuration\.md$/, category: 'Getting started', order: 3 },
  { match: /\/http-monitoring\.md$/, category: 'Features', order: 10 },
  { match: /\/logs\.md$/, category: 'Features', order: 11 },
  { match: /\/errors\.md$/, category: 'Features', order: 12 },
  { match: /\/performance\.md$/, category: 'Features', order: 13 },
  { match: /\/database\.md$/, category: 'Roadmap features', order: 20 },
  { match: /\/websockets\.md$/, category: 'Roadmap features', order: 21 },
  { match: /\/events\.md$/, category: 'Roadmap features', order: 22 },
  { match: /\/vscode\.md$/, category: 'Editors', order: 30 },
  { match: /\/cursor\.md$/, category: 'Editors', order: 31 },
  { match: /\/cli\.md$/, category: 'Operations', order: 40 },
  { match: /\/security\.md$/, category: 'Operations', order: 41 },
  { match: /\/troubleshooting\.md$/, category: 'Operations', order: 42 },
  { match: /\/publishing\.md$/, category: 'Operations', order: 43 },
  { match: /\/architecture\.md$/, category: 'Project', order: 50 },
  { match: /\/plugin-api\.md$/, category: 'Project', order: 51 },
];

function sectionFor(path: string): { category: string; order: number } {
  for (const section of SECTIONS) {
    if (section.match.test(path)) return { category: section.category, order: section.order };
  }
  return { category: 'More', order: 90 };
}

function firstHeading(content: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(content);
  return match ? match[1].trim() : fallback;
}

function firstParagraph(content: string): string {
  // first non-heading, non-code, non-table line
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (
      trimmed === '' ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('```') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('<') ||
      trimmed.startsWith('>')
    ) {
      continue;
    }
    return trimmed.replace(/\*\*/g, '').replace(/`/g, '').slice(0, 140);
  }
  return '';
}

export const pages: DocPage[] = Object.entries(modules)
  .map(([path, content]) => {
    const file = path.replace(/^.*docs\//, '');
    const slug = file.replace(/\.md$/, '').toLowerCase();
    const { category, order } = sectionFor(path);
    return {
      slug,
      title: firstHeading(content, prettifySlug(slug)),
      excerpt: firstParagraph(content),
      content,
      file,
      category,
      order,
    };
  })
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export const categories: Array<{ name: string; pages: DocPage[] }> = (() => {
  const map = new Map<string, DocPage[]>();
  for (const page of pages) {
    const list = map.get(page.category) ?? [];
    list.push(page);
    map.set(page.category, list);
  }
  return [...map.entries()].map(([name, docs]) => ({ name, pages: docs }));
})();

export function pageBySlug(slug: string): DocPage | undefined {
  return pages.find((page) => page.slug === slug);
}

function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
