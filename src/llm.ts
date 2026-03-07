import OpenAI from 'openai';

export interface SummarizeOptions {
  content: string;
  url?: string;
  title?: string;
}

// PROMPT is based on https://github.com/steipete/summarize so credits to him
const PROMPT = `You are a precise summarization engine. Follow the user instructions in <instructions> exactly. Never mention sponsors/ads/promos or that they were skipped or ignored. Do not output sponsor/ad/promo language or brand names or CTA phrases. Quotation marks are allowed; use straight quotes only (no curly quotes). If you include exact excerpts, italicize them in Markdown using single asterisks. Include 1-2 short exact excerpts (max 25 words each) when the content provides a strong, non-sponsor line. Never include ad/sponsor/boilerplate excerpts.`;

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-preview';

export async function summarize(
  opts: SummarizeOptions,
  model?: string
): Promise<string> {
  const { content, url, title } = opts;
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    defaultHeaders: { 'X-Title': 'Summarize Minimal' },
  });
  const n = (v: number) => v.toLocaleString();

  const ctx =
    (url ? `Source URL: ${url}` : '') + (title ? `\nPage name: ${title}` : '');
  const instr = [
    'Never mention sponsor/ads; use straight quotes only.',
    'Write a detailed summary capturing main points, facts, numbers, quotes.',
    '2-5 short paragraphs, 2-4 sentences each.',
    'Use Markdown "### " headings, start with a heading.',
    `Target: ~${n(9000)} chars (${n(6000)}-${n(14000)}).`,
    `Content length: ${n(content.length)} chars. Never exceed.`,
    'No emojis, disclaimers, or speculation. Direct factual language. Markdown.',
    'Short paragraphs, bullets only if needed. 1-2 short excerpts (max 25 words) in *italics*.',
    'Base strictly on provided content. Final check: remove any sponsor/ad references.',
  ].join('\n');

  const completion = await openai.chat.completions.create({
    model: model || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: `<instructions>\n${instr}\n</instructions>\n\n<context>\n${ctx}\n</context>\n\n<content>\n${content}\n</content>`,
      },
    ],
    temperature: 0,
  });

  return completion.choices[0]?.message?.content || '';
}
