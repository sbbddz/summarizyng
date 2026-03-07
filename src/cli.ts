import { Command } from 'commander';
import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchUrl } from './fetch.js';
import { summarize } from './llm.js';
import { renderForTerminal } from './terminal.js';

const execAsync = promisify(execFile);

const program = new Command();

program
  .name('summarizyng')
  .description('Summarize YouTube videos, articles, and files via OpenRouter')
  .version('0.11.2')
  .argument('<input>', 'URL or file path to summarize')
  .option(
    '-m, --model <model>',
    'OpenRouter model',
    'google/gemini-3.1-flash-lite-preview'
  )
  .option('-r, --raw', 'Output raw markdown (no terminal formatting)', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(run);

async function resolveFilePath(input: string): Promise<string> {
  if (input.startsWith('http://') || input.startsWith('https://')) return input;
  return isAbsolute(input) ? input : join(process.cwd(), input);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function parseFile(filePath: string) {
  const { stdout } = await execAsync('uvx', ['markitdown', filePath], {
    timeout: 60,
    maxBuffer: 50 * 1024 * 1024,
  });
  const content = stdout.trim();
  if (!content) throw new Error('markitdown returned empty output');
  return {
    filename: filePath.split('/').pop() || 'input',
    content,
    wordCount: content.split(/\s+/).filter((w: string) => w.length > 0).length,
  };
}

async function run(
  input: string,
  opts: {
    model?: string;
    raw?: boolean;
    verbose?: boolean;
  }
) {
  const isUrl = input.startsWith('http://') || input.startsWith('https://');
  const filePath = await resolveFilePath(input);
  const localFile = await isFile(filePath);
  if (!isUrl && !localFile)
    throw new Error(`Invalid input: ${input} is not a URL or valid file`);

  const outputRaw = opts.raw;

  let content = '',
    title: string | null = null,
    source = input;
  if (isUrl) {
    const r = await fetchUrl(input);
    content = r.content;
    title = r.title;
    source = r.siteName || input;
  } else {
    const r = await parseFile(filePath);
    content = r.content;
    title = r.filename;
    source = r.filename;
  }

  const summary = await summarize(
    {
      content,
      url: isUrl ? input : undefined,
      title: title ?? undefined,
    },
    opts.model
  );
  console.log(
    outputRaw ? summary : header(title, source) + renderForTerminal(summary)
  );
}

function header(title: string | null, source: string): string {
  if (!title) return '';
  const parts = [title, source].filter(Boolean);
  return parts.length
    ? `${'━'.repeat(40)}\n${parts.join(' · ')}\n${'━'.repeat(40)}\n`
    : '';
}

program.parse();
