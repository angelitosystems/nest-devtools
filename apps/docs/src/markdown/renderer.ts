import type { ReactNode } from 'react';

/**
 * Small, dependency-free markdown renderer tuned for the docs set:
 * headings (with ids), paragraphs, bold/italic/inline code, links (internal
 * .md links become SPA routes), fenced code blocks with language labels,
 * blockquotes, ordered/unordered lists, task lists and GFM tables.
 */

// ---------------------------------------------------------------- inline pass

type InlinePart =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'link'; text: string; href: string };

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  // code first so its content is not further parsed
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\n]+)\*|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ kind: 'text', text: text.slice(last, match.index) });
    }
    if (match[1] !== undefined) {
      parts.push({ kind: 'code', text: match[1] });
    } else if (match[2] !== undefined) {
      parts.push({ kind: 'strong', text: match[2] });
    } else if (match[3] !== undefined) {
      parts.push({ kind: 'em', text: match[3] });
    } else if (match[5] !== undefined) {
      parts.push({ kind: 'link', text: match[4] || match[5], href: match[5] });
    } else if (match[7] !== undefined) {
      parts.push({ kind: 'link', text: match[6], href: match[7] });
    } else if (match[8] !== undefined) {
      parts.push({ kind: 'link', text: match[8], href: match[8] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: 'text', text: text.slice(last) });
  }
  return parts;
}

/** Resolve a markdown link target to a SPA route when it points at a doc file. */
export function resolveLink(href: string, slugMap: Set<string>): { href: string; internal: boolean } {
  if (href.startsWith('http') || href.startsWith('mailto:')) {
    return { href, internal: false };
  }
  // strip ./ and .md
  const cleaned = href.replace(/^\.\//, '').replace(/\.md$/, '').toLowerCase();
  if (slugMap.has(cleaned)) {
    return { href: `/docs/${cleaned}`, internal: true };
  }
  // in-page anchor
  if (href.startsWith('#')) {
    return { href, internal: true };
  }
  return { href, internal: false };
}

function renderInline(text: string, slugMap: Set<string>, keyPrefix: string): ReactNode[] {
  return parseInline(text).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (part.kind) {
      case 'code':
        return <code key={key} className="md-code">{part.text}</code>;
      case 'strong':
        return <strong key={key}>{part.text}</strong>;
      case 'em':
        return <em key={key}>{part.text}</em>;
      case 'link': {
        const { href, internal } = resolveLink(part.href, slugMap);
        if (internal) {
          return (
            <a key={key} href={href} className="md-link">
              {part.text}
            </a>
          );
        }
        return (
          <a key={key} href={href} className="md-link" target="_blank" rel="noreferrer">
            {part.text} ↗
          </a>
        );
      }
      default:
        return <span key={key}>{part.text}</span>;
    }
  });
}

// ------------------------------------------------------------- block pass

interface Block {
  type: 'heading' | 'paragraph' | 'code' | 'quote' | 'ul' | 'ol' | 'table' | 'hr';
  level?: number;
  text?: string;
  lang?: string;
  items?: string[];
  rows?: string[][];
  header?: string[];
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    // fenced code
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buffer: string[] = [];
      index++;
      while (index < lines.length && !lines[index].startsWith('```')) {
        buffer.push(lines[index]);
        index++;
      }
      index++; // closing fence
      blocks.push({ type: 'code', lang, text: buffer.join('\n') });
      continue;
    }

    // heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index++;
      continue;
    }

    // hr
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      index++;
      continue;
    }

    // table
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[index + 1])) {
      const splitRow = (row: string) =>
        row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim());
      const header = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(splitRow(lines[index]));
        index++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    // blockquote
    if (line.startsWith('>')) {
      const buffer: string[] = [];
      while (index < lines.length && lines[index].startsWith('>')) {
        buffer.push(lines[index].replace(/^>\s?/, ''));
        index++;
      }
      blocks.push({ type: 'quote', text: buffer.join(' ') });
      continue;
    }

    // lists
    const ulMatch = /^(\s*)[-*]\s+(.*)$/.exec(line);
    const olMatch = /^(\s*)\d+\.\s+(.*)$/.exec(line);
    if (ulMatch || olMatch) {
      const ordered = Boolean(olMatch);
      const items: string[] = [];
      while (index < lines.length) {
        const itemMatch = ordered ? /^(\s*)\d+\.\s+(.*)$/.exec(lines[index]) : /^(\s*)[-*]\s+(.*)$/.exec(lines[index]);
        if (!itemMatch) break;
        const raw = itemMatch[2];
        // task list
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(raw);
        items.push(task ? (task[1].toLowerCase() === 'x' ? '☑ ' : '☐ ') + task[2] : raw);
        index++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }

    // paragraph: gather until blank line or block starter
    if (line.trim() !== '') {
      const buffer: string[] = [];
      while (
        index < lines.length &&
        lines[index].trim() !== '' &&
        !lines[index].startsWith('#') &&
        !lines[index].startsWith('```') &&
        !lines[index].startsWith('>') &&
        !/^(\s*)[-*]\s+/.test(lines[index]) &&
        !/^(\s*)\d+\.\s+/.test(lines[index])
      ) {
        buffer.push(lines[index]);
        index++;
      }
      blocks.push({ type: 'paragraph', text: buffer.join(' ') });
      continue;
    }

    index++;
  }

  return blocks;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Render a markdown string into React nodes. */
export function renderMarkdown(markdown: string, slugMap: Set<string>): ReactNode {
  const blocks = parseBlocks(markdown);

  return (
    <>
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.type) {
          case 'heading': {
            const text = block.text ?? '';
            const id = slugifyHeading(text);
            const content = renderInline(text, slugMap, key);
            if (block.level === 1) return <h1 key={key} id={id}>{content}</h1>;
            if (block.level === 2) return <h2 key={key} id={id}>{content}</h2>;
            if (block.level === 3) return <h3 key={key} id={id}>{content}</h3>;
            return <h4 key={key} id={id}>{content}</h4>;
          }
          case 'paragraph':
            return <p key={key}>{renderInline(block.text ?? '', slugMap, key)}</p>;
          case 'code':
            return (
              <pre key={key} className="md-pre" data-lang={block.lang || undefined}>
                <code>{block.text}</code>
              </pre>
            );
          case 'quote':
            return <blockquote key={key}>{renderInline(block.text ?? '', slugMap, key)}</blockquote>;
          case 'hr':
            return <hr key={key} className="md-hr" />;
          case 'ul':
            return (
              <ul key={key} className="md-ul">
                {(block.items ?? []).map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item, slugMap, `${key}-${itemIndex}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="md-ol">
                {(block.items ?? []).map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item, slugMap, `${key}-${itemIndex}`)}</li>
                ))}
              </ol>
            );
          case 'table':
            return (
              <div key={key} className="md-table-wrap">
                <table className="md-table">
                  <thead>
                    <tr>
                      {(block.header ?? []).map((cell, cellIndex) => (
                        <th key={cellIndex}>{renderInline(cell, slugMap, `${key}-h-${cellIndex}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(block.rows ?? []).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{renderInline(cell, slugMap, `${key}-${rowIndex}-${cellIndex}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
