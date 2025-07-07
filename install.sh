#!/bin/bash

# Loggy One-Line Installer
set -e

echo "🪵 Installing Loggy..."

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if ! command -v brew &> /dev/null; then
            echo "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install node
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "❌ Unsupported OS. Please install Node.js manually."
        exit 1
    fi
fi

# Install Claude Code CLI
echo "🤖 Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

# Create project directory
PROJECT_DIR="loggy-$(date +%s)"
echo "📁 Creating project directory: $PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Download the prompt
echo "📥 Downloading Loggy prompt..."
curl -s https://raw.githubusercontent.com/jnakagawa/loggy/main/loggy.md > loggy-prompt.md

# Extract just the prompt content (remove YAML frontmatter)
echo "🔧 Preparing prompt..."
sed '1,/^---$/d; /^---$/,$d' loggy-prompt.md > prompt.txt

# Run Claude Code with the prompt
echo "🚀 Starting Loggy in Claude Code..."
echo "Paste this into Claude Code when it opens:"
echo "----------------------------------------"
cat prompt.txt
echo "----------------------------------------"

# Open Claude Code
claude .

echo "✅ Loggy is ready! Copy the prompt above and paste it into Claude Code."