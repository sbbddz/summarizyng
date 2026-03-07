import { render as renderMarkdownAnsi } from 'markdansi';

function processMarkdown(
  markdown: string,
  inFence: boolean,
  processFn: (s: string) => string
): string {
  const lines = markdown.split(/\r?\n/),
    out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    out.push(processFn(line));
  }
  return out.join('\n');
}

function collapseBlankLines(markdown: string): string {
  let blankRun = 0;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) {
        blankRun++;
        return blankRun === 2 ? '' : line;
      }
      blankRun = 0;
      return line;
    })
    .join('\n');
}

function inlineLinks(markdown: string): string {
  const defs = new Map<string, string>();
  markdown.replace(
    /^\s*\[([^\]]+)\]:\s*(\S+)\s*$/gm,
    (_, k, v) => defs.set(k.toLowerCase(), v) as any
  );
  if (!defs.size) return markdown;
  const used = new Set<string>();
  let r = markdown.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (_, l, ref) => {
    const k = (ref || l).toLowerCase(),
      url = defs.get(k);
    if (!url) return _;
    used.add(k);
    return `[${l}](${url})`;
  });
  return r
    .split('\n')
    .filter((l) => {
      const m = l.match(/^\s*\[([^\]]+)\]/);
      return !m || !used.has(m[1]?.toLowerCase());
    })
    .join('\n');
}

export function prepareMarkdownForTerminal(markdown: string): string {
  let m = processMarkdown(markdown, false, (l) =>
    l.replace(
      /(?<!!)\[([^\]]+)\]\((\S+?)\)/g,
      (_, l, u) => `${l.trim()}: ${u.trim()}`
    )
  );
  m = inlineLinks(m);
  return collapseBlankLines(m);
}

export function renderForTerminal(markdown: string, width = 80): string {
  return renderMarkdownAnsi(prepareMarkdownForTerminal(markdown), {
    width,
    wrap: true,
    color: process.stdout.isTTY ?? false,
    hyperlinks: true,
  });
}
