#!/bin/bash

# Install native messaging host for auto-starting proxy from extension

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST_FILE="$SCRIPT_DIR/native-host/com.analytics_logger.proxy.json"

echo "🔧 Installing Analytics Logger Native Messaging Host..."
echo ""

# Get extension ID
echo "Please enter your Analytics Logger extension ID"
echo "(Find it at chrome://extensions/ with Developer mode enabled)"
read -p "Extension ID: " EXTENSION_ID

if [ -z "$EXTENSION_ID" ]; then
    echo "❌ Extension ID required"
    exit 1
fi

# Update paths in manifest
TEMP_MANIFEST=$(mktemp)
sed "s|REPLACE_WITH_YOUR_EXTENSION_ID|$EXTENSION_ID|g" "$MANIFEST_FILE" > "$TEMP_MANIFEST"
sed -i.bak "s|/Users/jonahnakagawa/vibes/extension-analytics-logger|$SCRIPT_DIR|g" "$TEMP_MANIFEST"

# Install to Chrome's native messaging hosts directory
NATIVE_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$NATIVE_HOST_DIR"

cp "$TEMP_MANIFEST" "$NATIVE_HOST_DIR/com.analytics_logger.proxy.json"
rm "$TEMP_MANIFEST" "${TEMP_MANIFEST}.bak" 2>/dev/null

echo "✅ Native messaging host installed!"
echo ""
echo "Now you can start/stop the proxy from the extension UI."
echo ""
