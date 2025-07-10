#!/bin/bash

# Loggy One-Line Installer
set -e

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

# Security: Verify downloaded file integrity
echo "🔐 Verifying file integrity..."
EXPECTED_LOGGY_SHA256="02cc0c0fdeb0cf127788177ac8ed56a14d82c216ebd63471698a88e593c66d51"
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