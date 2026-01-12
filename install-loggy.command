#!/bin/bash
echo "========================================"
echo "  Loggy Installer"
echo "========================================"
echo ""

cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"

echo "Project folder: $SCRIPT_DIR"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is required but not installed."
    echo "Please install Node.js from https://nodejs.org/"
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

echo "Installing dependencies..."
npm install --silent
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies."
    read -p "Press Enter to close..."
    exit 1
fi
echo "Dependencies installed."
echo ""

echo "Installing native messaging host..."

mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

cat > "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.analytics_logger.proxy.json" << MANIFEST
{
  "name": "com.analytics_logger.proxy",
  "description": "Analytics Logger Proxy Control",
  "path": "$SCRIPT_DIR/native-host/proxy-host.cjs",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://fjjefbnnidhdendpklagiabocigalhkp/"]
}
MANIFEST

chmod +x "$SCRIPT_DIR/native-host/proxy-host.cjs"

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Reload the Loggy extension in Chrome"
echo "2. Click the Start Proxy button"
echo ""
read -p "Press Enter to close..." || true
exit 0
