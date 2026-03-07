# summarizyng

CLI tool to summarize URLs (articles, YouTube) and files via OpenRouter.

## Install

```bash
pnpm install -g .
```

## Usage

```bash
summarizyng <url-or-file> [options]
```

Options:

- `-m, --model <model>` - OpenRouter model (default: google/gemini-3.1-flash-lite-preview)
- `-l, --length <length>` - short, medium, long, xl (default: xl)
- `-f, --format <format>` - text, md (default: text)
- `-e, --extract` - extract content only, no summary
- `-v, --verbose` - verbose output

Inspired by [steipete/summarize](https://github.com/steipete/summarize).
