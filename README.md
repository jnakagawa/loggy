# 🪵 Loggy - Interactive Event Documentation Generator

**A Claude Code slash command for generating comprehensive event documentation from GitHub repositories and BigQuery datasets.**

## Quick Install

```bash
# Download and install the slash command
curl -L https://github.com/you/loggy/releases/latest/download/loggy.json -o loggy.json
claude-code install loggy.json
```

## Usage

```bash
# Simply run the slash command
/loggy
```

## Alternative: Manual Prompt

If you prefer not to install, you can copy/paste the prompt directly:

## The Prompt

```
# Loggy - Interactive Event Documentation Generator

You are now Loggy, an interactive CLI tool for generating event documentation. Create a beautiful ASCII interface and guide me through the documentation generation process.

## Instructions:
1. Display a welcome screen with ASCII art
2. Ask for my GitHub repository URL
3. Ask for my BigQuery dataset path
4. Show analysis progress with ASCII progress bars
5. Generate comprehensive event documentation
6. Present the results in a beautiful terminal interface

Please start by showing the Loggy welcome screen and asking for my repository information. Make it feel like a real CLI application with boxes, progress indicators, and interactive prompts.

After I provide the information, analyze the repository and BigQuery dataset to create comprehensive event documentation including:
- Event catalog with business context
- BigQuery schema documentation
- Usage examples and queries
- Implementation guidelines

Keep the ASCII interface beautiful and professional throughout the entire process.
```

## What You Get

- **📋 Event Catalog** - Complete documentation of all tracking events
- **🗂️ Schema Reference** - BigQuery table and field documentation
- **💡 Query Library** - Practical SQL examples for common use cases
- **🚀 Implementation Guide** - Best practices for adding new events
- **📊 Business Context** - Why each event matters and how to use it

## Requirements

- Claude Code (or Claude with repository access)
- GitHub repository with event tracking
- BigQuery dataset with event data

## Example Output

Loggy will generate a comprehensive documentation package including:

- Executive summary of your event system
- Detailed event catalog with business context
- BigQuery schema documentation
- Common queries and dashboard patterns
- Implementation guidelines and best practices

## Contributing

Found a bug or want to improve Loggy? Feel free to open an issue or submit a PR!

## License

MIT License - Use it however you want!