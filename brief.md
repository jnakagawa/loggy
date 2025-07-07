# Loggy - Project Brief

## Overview
Loggy is a Claude Code slash command that generates comprehensive event documentation by analyzing GitHub repositories and BigQuery datasets.

## Final Design Decision
**Claude Code Slash Command** - The optimal solution for minimal friction and maximum usability.

## Key Features
- **Zero Installation Friction** - One-line install command
- **Interactive ASCII Interface** - Beautiful terminal UI within Claude responses
- **Comprehensive Documentation** - Event catalogs, schema docs, SQL queries, implementation guides
- **Business Context Focus** - Explains why events matter, not just what they do

## User Experience
```bash
# Install once
curl -L https://github.com/you/loggy/releases/latest/download/loggy.json | claude-code install -

# Use forever
/loggy
```

## Distribution Strategy
- **GitHub Repository** with slash command JSON
- **GitHub Releases** for versioned downloads
- **One-line install** in README
- **Fallback manual prompt** for non-technical users

## Core Value Proposition
Transform scattered event tracking code and BigQuery schemas into actionable, business-focused documentation through an intuitive conversational interface.

## Technical Implementation
- Single `loggy.json` file containing the interactive prompt
- Leverages Claude Code's built-in repository analysis capabilities
- No external dependencies or API keys required
- Works with any GitHub repo and BigQuery dataset

## Success Metrics
- Easy installation (one command)
- Beautiful user experience (ASCII interface)
- Comprehensive output (actionable documentation)
- Zero barriers to entry (no API keys or complex setup)