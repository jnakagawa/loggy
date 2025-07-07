# 🪵 Loggy

Interactive event documentation generator for GitHub repos and BigQuery datasets.

## What it does

Analyzes your codebase and generates comprehensive documentation for analytics events, then writes the descriptions back to BigQuery.

## Quick Install

```bash
curl -s https://raw.githubusercontent.com/jnakagawa/loggy/main/install.sh | bash
```

This will:
- Install Node.js (if needed)
- Install Claude Code CLI
- Create a project directory
- Download the Loggy prompt
- Open Claude Code ready to go

## Manual Install

1. Install [Claude Code](https://claude.ai/code)
2. Create a new directory for your project
3. Open the directory in Claude Code
4. Copy the contents of `loggy.md`
5. Paste into Claude Code
6. Follow the prompts

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