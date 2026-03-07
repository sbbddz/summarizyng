import { spawn } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_CHARS = 500000;

export interface FetchResult {
  url: string;
  title: string | null;
  content: string;
  siteName: string | null;
  wordCount: number;
  truncated: boolean;
  isYouTube: boolean;
}

interface ExtractedContent {
  title: string | null;
  content: string;
  siteName: string | null;
  wordCount: number;
}

export function extractFromHtml(html: string, url: string): ExtractedContent {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article)
    return { title: null, content: '', siteName: null, wordCount: 0 };
  const text = article.textContent || '';
  return {
    title: article.title || null,
    content: text,
    siteName: article.siteName || null,
    wordCount: text.split(/\s+/).filter((w: string) => w.length > 0).length,
  };
}

export function truncateContent(content: string, maxChars: number) {
  if (content.length <= maxChars) return { content, truncated: false };
  const cut = content.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const end = lastSpace > maxChars * 0.8 ? lastSpace : maxChars;
  return { content: cut.slice(0, end).trim() + '...', truncated: true };
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host.includes('youtube.com') || host === 'youtu.be';
  } catch {
    return false;
  }
}

export async function fetchUrl(
  url: string,
  options?: { timeout?: number; maxChars?: number }
): Promise<FetchResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;

  if (isYouTubeUrl(url)) {
    return fetchYouTube(url, { timeout, maxChars });
  }

  return fetchHttp(url, { timeout, maxChars });
}

async function fetchHttp(
  url: string,
  opts: { timeout: number; maxChars: number }
): Promise<FetchResult> {
  const https = await import('node:https');
  const http = await import('node:http');

  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        rejectUnauthorized: false,
      },
      (res) => {
        if (!res || !res.statusCode || res.statusCode >= 400) {
          reject(
            new Error(
              `HTTP ${res?.statusCode}: ${res?.statusMessage || 'Unknown error'}`
            )
          );
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf-8');
          const extracted = extractFromHtml(html, url);
          const { content, truncated } = truncateContent(
            extracted.content,
            opts.maxChars
          );

          resolve({
            url,
            title: extracted.title,
            content,
            siteName: extracted.siteName,
            wordCount: extracted.wordCount,
            truncated,
            isYouTube: false,
          });
        });
      }
    );

    req.on('error', (err) => {
      reject(new Error(`fetch failed: ${err.message}`));
    });

    req.setTimeout(opts.timeout, () => {
      req.destroy();
      reject(new Error('fetch timed out'));
    });
  });
}

async function fetchYouTube(
  url: string,
  opts: { timeout: number; maxChars: number }
): Promise<FetchResult> {
  const transcript = await getYouTubeTranscript(url, opts.timeout);

  const titleMatch = transcript.match(/^Title: (.+)$/m);
  const title = titleMatch ? titleMatch[1] : null;

  let content = transcript.replace(/^Title: .+$/m, '').trim();
  const { content: truncatedContent, truncated } = truncateContent(
    content,
    opts.maxChars
  );

  return {
    url,
    title,
    content: truncatedContent,
    siteName: 'YouTube',
    wordCount: content.split(/\s+/).filter((w) => w.length > 0).length,
    truncated,
    isYouTube: true,
  };
}

function runProcess(
  cmd: string,
  args: string[],
  timeout: number
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: false });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      stderr += '\n[timeout]';
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      stderr += err.message;
      resolve({ stdout, stderr, code: 1 });
    });
  });
}

async function getYouTubeTranscript(
  url: string,
  timeoutMs: number
): Promise<string> {
  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'summarize-yt-'));

  try {
    console.error('[yt-dlp] Getting video info...');

    // Get video info
    const info = await runProcess(
      'yt-dlp',
      ['--dump-json', '--skip-download', url],
      timeoutMs
    );

    if (info.code !== 0) {
      console.error('[yt-dlp] stderr:', info.stderr);
      throw new Error(`yt-dlp failed: ${info.stderr.slice(0, 200)}`);
    }

    let title = '';
    let description = '';

    try {
      const parsed = JSON.parse(info.stdout);
      title = parsed.title || '';
      description = parsed.description || '';
    } catch {
      // Fallback if not JSON
      const lines = info.stdout.split('\n').filter((l) => l.trim());
      title = lines[0] || '';
    }

    console.error('[yt-dlp] Got title:', title);

    // Try to get subtitles
    const subs = await runProcess(
      'yt-dlp',
      [
        '--write-subs',
        '--write-auto-subs',
        '--sub-lang',
        'en',
        '--skip-download',
        '--output',
        `${dir}/transcript`,
        url,
      ],
      timeoutMs
    );

    let transcriptText = '';

    // Look for subtitle files
    try {
      const files = await fs.readdir(dir);
      const subFile = files.find(
        (f) => f.endsWith('.vtt') || f.endsWith('.srt')
      );

      if (subFile) {
        const content = await fs.readFile(path.join(dir, subFile), 'utf-8');
        // Simple strip of timestamps
        transcriptText = content
          .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/^\d+\s*$/gm, '')
          .trim();
      }
    } catch {
      // No subs
    }

    const content = transcriptText || description;

    if (!content && !title) {
      throw new Error('Failed to get YouTube content');
    }

    return `Title: ${title}\n\n${content}`;
  } catch (error) {
    throw new Error(
      `Failed to fetch YouTube: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {}
  }
}
