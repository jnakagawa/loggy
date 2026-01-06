#!/bin/bash
echo "========================================"
echo "  Loggy Installer (Developer Mode)"
echo "========================================"
echo ""

cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"

echo "Project folder: $SCRIPT_DIR"
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
read -p "Press Enter to close..."
