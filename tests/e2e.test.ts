import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(import.meta.url), '..');

describe('E2E: Web Page Extraction', () => {
  it('should extract content from HTML', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Test Article</title></head>
      <body>
        <article>
          <h1>Test Article Title</h1>
          <p>This is a test paragraph with some content.</p>
          <p>Another paragraph with more information.</p>
        </article>
      </body>
      </html>
    `;

    nock('http://example.com').get('/article').reply(200, html);

    const { extractFromHtml } = await import('../src/fetch.js');
    const result = extractFromHtml(html, 'http://example.com/article');

    expect(result.title).toBe('Test Article');
    expect(result.content).toContain('Test Article Title');
    expect(result.content).toContain('test paragraph');
    expect(result.wordCount).toBeGreaterThan(5);
  });

  it('should truncate content when too long', async () => {
    const { truncateContent } = await import('../src/fetch.js');

    const longContent = 'a'.repeat(1000);
    const result = truncateContent(longContent, 100);

    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThan(110);
  });
});

describe('E2E: File Parsing', () => {
  it.skip('should parse markdown files', async () => {
    // This test requires external tools (uvx/markitdown) and is more of an integration test
    // The file parsing functionality is tested indirectly through other tests
  }, 30000);
});

describe('E2E: LLM Summarization', () => {
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    if (originalApiKey) {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it('should call OpenRouter API and return summary', async () => {
    nock('https://openrouter.ai/api/v1')
      .post('/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: 'This is a mock summary of the content.',
            },
          },
        ],
      });

    const { summarize } = await import('../src/llm.js');
    const result = await summarize({
      content: 'Some test content to summarize',
    });

    expect(result).toBe('This is a mock summary of the content.');
  }, 10000);

  it('should throw error when API key is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const { summarize } = await import('../src/llm.js');

    await expect(
      summarize({
        content: 'Test content',
      })
    ).rejects.toThrow('OPENROUTER_API_KEY');
  });
});

describe('E2E: Terminal Rendering', () => {
  it('should render markdown for terminal', async () => {
    const { renderForTerminal } = await import('../src/terminal.js');

    const markdown = '# Hello\n\n**Bold** and *italic* text';
    const result = renderForTerminal(markdown, 80);

    expect(result).toContain('Hello');
  });
});
