#!/bin/bash

# One-Click Installer for Analytics Logger
# Double-click this file to install everything automatically

cd "$(dirname "$0")"

clear
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║        Analytics Logger - One-Click Installer              ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "This will enable the 'Start Proxy' button in the extension."
echo ""

# Check if extension is loaded
echo "🔍 Looking for Analytics Logger extension..."
echo ""

# Find the extension ID automatically
EXTENSION_DIR="$HOME/Library/Application Support/Google/Chrome/Default/Extensions"
EXTENSION_ID=""

if [ -d "$EXTENSION_DIR" ]; then
    # Look for our extension manifest
    for dir in "$EXTENSION_DIR"/*; do
        if [ -d "$dir" ]; then
            # Check latest version folder
            LATEST_VERSION=$(ls -1 "$dir" | sort -V | tail -1)
            MANIFEST="$dir/$LATEST_VERSION/manifest.json"

            if [ -f "$MANIFEST" ]; then
                # Check if it's our extension
                if grep -q "Extension Analytics Logger" "$MANIFEST"; then
                    EXTENSION_ID=$(basename "$dir")
                    echo "✅ Found extension ID: $EXTENSION_ID"
                    break
                fi
            fi
        fi
    done
fi

if [ -z "$EXTENSION_ID" ]; then
    echo "❌ Extension not found!"
    echo ""
    echo "Please:"
    echo "1. Load the extension in Chrome (chrome://extensions/)"
    echo "2. Run this installer again"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""
echo "📝 Creating native messaging host..."

# Update manifest with correct paths and extension ID
SCRIPT_DIR="$(pwd)"
MANIFEST_TEMPLATE="native-host/com.analytics_logger.proxy.json"
MANIFEST_DEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.analytics_logger.proxy.json"

# Create directory
mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Create manifest with correct values
cat > "$MANIFEST_DEST" << EOF
{
  "name": "com.analytics_logger.proxy",
  "description": "Analytics Logger Proxy Control",
  "path": "$SCRIPT_DIR/native-host/proxy-host.cjs",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

# Make proxy host executable
chmod +x "native-host/proxy-host.cjs"

echo "✅ Native messaging host installed!"
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     Installation Complete!                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "1. Reload the Analytics Logger extension"
echo "2. Open Settings in the extension"
echo "3. Click 'Start Proxy' button"
echo "4. Open Chrome with proxy: npm run chrome"
echo "   (or use the terminal command shown in settings)"
echo ""
echo "That's it! No terminal knowledge needed."
echo ""
read -p "Press Enter to exit..."
