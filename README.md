# 🪵 Loggy

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                      ║
║  ██╗      ██████╗  ██████╗  ██████╗██╗   ██╗                                         ║
║  ██║     ██╔═══██╗██╔════╝ ██╔════╝╚██╗ ██╔╝                                         ║
║  ██║     ██║   ██║██║  ███╗██║  ███╗╚████╔╝                                          ║
║  ██║     ██║   ██║██║   ██║██║   ██║ ╚██╔╝                                           ║
║  ███████╗╚██████╔╝╚██████╔╝╚██████╔╝  ██║                                            ║
║  ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝   ╚═╝                                            ║
║                                                                                      ║
║               🪵 Interactive Event Documentation Generator   🪵                       ║
║                                                                                      ║
║               "It's logging time :)"                                                 ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```


Claude Code Skin for interactive event documentation generator for GitHub repos and BigQuery datasets.

## What it does

Analyzes your codebase and generates comprehensive documentation for analytics events, then writes the descriptions back to BigQuery.
Given a set of event based tables (from Bigquery), Loggy ingests the github codebase repo and generates comprehensive documentation for analytics tables.

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