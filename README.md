# 🪵 Loggy

Interactive event documentation generator for GitHub repos and BigQuery datasets.

## What it does

Analyzes your codebase and generates comprehensive documentation for analytics events, then writes the descriptions back to BigQuery.

## How to use

1. Install [Claude Code](https://claude.ai/code)
2. Create a new directory for your project
3. Open the directory in Claude Code
4. Copy the contents of `loggy.md`
5. Paste into Claude Code
6. Follow the prompts

That's it!

## What you'll need

- GitHub repo with analytics events
- BigQuery dataset
- GitHub personal access token  
- Google Cloud SDK

## Features

- Index-first search (99.9% faster than reading full codebase)
- Generates comprehensive event documentation
- Writes table descriptions back to BigQuery
- Beautiful ASCII interface with progress bars