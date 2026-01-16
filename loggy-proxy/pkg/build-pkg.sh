#!/bin/bash
# Build macOS .pkg installer for Loggy Proxy
# Usage: ./build-pkg.sh [version] [arch]
# Example: ./build-pkg.sh 1.0.0 arm64

set -e

VERSION="${1:-1.0.0}"
ARCH="${2:-arm64}"  # arm64 or amd64
IDENTIFIER="com.loggy.proxy"
INSTALL_LOCATION="/usr/local/bin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$SCRIPT_DIR/build"
PAYLOAD_DIR="$BUILD_DIR/payload"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"

# Determine binary name based on architecture
if [ "$ARCH" = "universal" ]; then
    BINARY_NAME="loggy-proxy-darwin-universal"
    PKG_NAME="loggy-proxy-${VERSION}-macos-universal.pkg"
else
    BINARY_NAME="loggy-proxy-darwin-${ARCH}"
    PKG_NAME="loggy-proxy-${VERSION}-macos-${ARCH}.pkg"
fi

BINARY_PATH="$PROJECT_DIR/$BINARY_NAME"

echo "Building .pkg installer..."
echo "  Version: $VERSION"
echo "  Architecture: $ARCH"
echo "  Binary: $BINARY_PATH"

# Check if binary exists
if [ ! -f "$BINARY_PATH" ]; then
    echo "Error: Binary not found at $BINARY_PATH"
    echo "Please build it first with: make build-darwin-${ARCH}"
    exit 1
fi

# Clean and create build directories
rm -rf "$BUILD_DIR"
mkdir -p "$PAYLOAD_DIR$INSTALL_LOCATION"

# Copy binary to payload
cp "$BINARY_PATH" "$PAYLOAD_DIR$INSTALL_LOCATION/loggy-proxy"
chmod +x "$PAYLOAD_DIR$INSTALL_LOCATION/loggy-proxy"

# Ensure scripts are executable
chmod +x "$SCRIPTS_DIR/postinstall"

# Build the component package
echo "Creating component package..."
pkgbuild \
    --root "$PAYLOAD_DIR" \
    --scripts "$SCRIPTS_DIR" \
    --identifier "$IDENTIFIER" \
    --version "$VERSION" \
    --install-location "/" \
    "$BUILD_DIR/loggy-proxy-component.pkg"

# Create distribution.xml for a nicer installer experience
cat > "$BUILD_DIR/distribution.xml" << EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
    <title>Loggy Proxy</title>
    <organization>com.loggy</organization>
    <domains enable_localSystem="true"/>
    <options customize="never" require-scripts="true" rootVolumeOnly="true"/>

    <welcome file="welcome.html" mime-type="text/html"/>

    <choices-outline>
        <line choice="default">
            <line choice="loggy-proxy"/>
        </line>
    </choices-outline>

    <choice id="default"/>
    <choice id="loggy-proxy" visible="false">
        <pkg-ref id="$IDENTIFIER"/>
    </choice>

    <pkg-ref id="$IDENTIFIER" version="$VERSION" onConclusion="none">loggy-proxy-component.pkg</pkg-ref>
</installer-gui-script>
EOF

# Create welcome.html
cat > "$BUILD_DIR/welcome.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            padding: 20px;
            line-height: 1.6;
        }
        h1 { font-size: 24px; margin-bottom: 10px; }
        p { color: #333; }
        .highlight {
            background: #f0f7ff;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #4A90D9;
        }
    </style>
</head>
<body>
    <h1>Loggy Proxy Installer</h1>
    <p>This will install the Loggy Proxy on your Mac, enabling HTTPS traffic capture for the Loggy Chrome extension.</p>

    <div class="highlight">
        <strong>What gets installed:</strong>
        <ul>
            <li>Loggy Proxy binary at <code>/usr/local/bin/loggy-proxy</code></li>
            <li>Chrome Native Messaging configuration</li>
        </ul>
    </div>

    <p>After installation, return to Chrome and reload the Loggy extension to start capturing analytics events.</p>
</body>
</html>
EOF

# Build the final product package
echo "Creating distribution package..."
productbuild \
    --distribution "$BUILD_DIR/distribution.xml" \
    --resources "$BUILD_DIR" \
    --package-path "$BUILD_DIR" \
    "$BUILD_DIR/$PKG_NAME"

# Move final package to project root
mv "$BUILD_DIR/$PKG_NAME" "$PROJECT_DIR/$PKG_NAME"

echo ""
echo "Package created: $PROJECT_DIR/$PKG_NAME"
echo ""
echo "To test locally:"
echo "  sudo installer -pkg $PROJECT_DIR/$PKG_NAME -target /"

# Clean up intermediate files
rm -rf "$BUILD_DIR"
