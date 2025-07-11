#!/bin/bash

# Loggy One-Line Installer
set -e

# Security: Verify this script's integrity using external checksum
if [ -f "$0" ] && [ "$0" != "bash" ]; then
    echo "🔐 Verifying installer integrity..."
    curl -s "https://api.github.com/repos/jnakagawa/loggy/contents/SHA256SUMS" | python3 -c "import json,sys,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())" > /tmp/SHA256SUMS
    if sha256sum -c /tmp/SHA256SUMS --ignore-missing 2>/dev/null | grep -q "install.sh: OK"; then
        echo "✅ Installer integrity verified"
    else
        echo "❌ Security Error: Installer integrity check failed"
        echo "This installer may have been tampered with. Please download from the official source."
        exit 1
    fi
    rm -f /tmp/SHA256SUMS
else
    echo "ℹ️  Running installer from pipe (integrity check skipped)"
fi

echo "🪵 Installing Loggy..."

# Security: Checksum verification function
verify_checksum() {
    local file="$1"
    local expected_checksum="$2"
    local actual_checksum="$(sha256sum "$file" | cut -d' ' -f1)"
    
    if [ "$actual_checksum" != "$expected_checksum" ]; then
        echo "❌ Security Error: Checksum verification failed for $file"
        echo "Expected: $expected_checksum"
        echo "Actual: $actual_checksum"
        exit 1
    fi
    echo "✅ Checksum verified for $file"
}

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - Try Homebrew first, fall back to NVM
        if ! command -v brew &> /dev/null; then
            echo "Homebrew not found. Installing Node.js via NVM (no sudo required)..."
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            nvm install --lts
            nvm use --lts
        else
            echo "Using Homebrew to install Node.js..."
            brew install node
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux - Install Node.js via Node Version Manager (no sudo required)
        echo "Installing Node.js via NVM (no sudo required)..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install --lts
        nvm use --lts
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
curl -s "https://api.github.com/repos/jnakagawa/loggy/contents/loggy.md" | python3 -c "import json,sys,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())" > loggy-prompt.md

# Security: Verify downloaded file integrity
echo "🔐 Verifying file integrity..."
EXPECTED_LOGGY_SHA256="a9e49ca264acb4681ca25c3061ca5c43f56f8a8e67d5d05c04fe4769de95ef7d"
verify_checksum "loggy-prompt.md" "$EXPECTED_LOGGY_SHA256"

# Extract just the prompt content (remove YAML frontmatter)
echo "🔧 Preparing prompt..."
sed '1,/^---$/d; /^---$/,$d' loggy-prompt.md > prompt.txt

# Installation complete - provide next steps
echo "✅ Installation complete!"
echo ""
echo "🚀 To start Loggy, run this command:"
echo "   cd $PROJECT_DIR && claude \"\$(cat prompt.txt)\""
echo ""
echo "📋 Or copy and paste this command:"
echo "cd $PROJECT_DIR && claude \"\$(cat prompt.txt)\""