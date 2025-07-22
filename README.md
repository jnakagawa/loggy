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
║               🪵 Your friendly AI Data Documentation Wizard 🪵                       ║
║                                                                                      ║
║               "It's logging time :)"                                                 ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```
<img src="loggy.png" alt="Loggy" width="300">
Claude Code Wizard for repo-driven documentation of BigQuery event datasets.

## What it does

Given a dataset of event-data tables(from Bigquery), Loggy ingests the relevant github codebase repo and generates comprehensive documentation for those analytics tables.

## What you'll need

- GitHub repo with analytics events
- BigQuery dataset with events fired from that repo's code
- Claude Pro subscription (for Claude Code CLI access)
- GitHub personal access token  
- Google Cloud SDK and API access

## 🚀 Quick Start

### Secure Installation (Recommended)

1. Download and verify the installer:
```bash
curl -sSL https://raw.githubusercontent.com/jnakagawa/loggy/main/install.sh > install.sh
curl -sSL https://raw.githubusercontent.com/jnakagawa/loggy/main/SHA256SUMS > SHA256SUMS
sha256sum -c SHA256SUMS --ignore-missing
```

2. Run the verified installer:
```bash
chmod +x install.sh
./install.sh
```

### Quick Install (Less Secure

For convenience, you can run the one-liner (but verification is recommended):

```bash
curl -sSL https://raw.githubusercontent.com/jnakagawa/loggy/main/install.sh | bash
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

