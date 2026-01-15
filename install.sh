#!/bin/bash
#
# Loggy Proxy Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/jnakagawa/loggy/main/install.sh | bash
#

set -e

REPO="jnakagawa/loggy"
BINARY_NAME="loggy-proxy"
INSTALL_DIR="/usr/local/bin"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "🪵 Loggy Proxy Installer"
echo "========================"
echo ""

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH="amd64"
        ;;
    arm64|aarch64)
        ARCH="arm64"
        ;;
    *)
        echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
if [ "$OS" != "darwin" ]; then
    echo -e "${RED}Error: This installer only supports macOS${NC}"
    exit 1
fi

BINARY_URL="https://github.com/${REPO}/releases/latest/download/${BINARY_NAME}-${OS}-${ARCH}"

echo "Detected: macOS ($ARCH)"
echo ""

# Check if /usr/local/bin exists and is writable
if [ ! -d "$INSTALL_DIR" ]; then
    echo "Creating $INSTALL_DIR..."
    sudo mkdir -p "$INSTALL_DIR"
fi

# Download binary
echo "Downloading Loggy Proxy..."
if ! curl -fsSL "$BINARY_URL" -o "/tmp/$BINARY_NAME"; then
    echo -e "${RED}Error: Failed to download binary${NC}"
    echo "URL: $BINARY_URL"
    echo ""
    echo "The release may not exist yet. Try building from source:"
    echo "  git clone https://github.com/$REPO"
    echo "  cd loggy/loggy-proxy && make install"
    exit 1
fi

chmod +x "/tmp/$BINARY_NAME"

# Install binary
echo "Installing to $INSTALL_DIR..."
if [ -w "$INSTALL_DIR" ]; then
    mv "/tmp/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
else
    sudo mv "/tmp/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
fi

echo ""
echo -e "${GREEN}✓ Binary installed${NC}"
echo ""

# Get extension ID
echo -e "${YELLOW}What is your Loggy extension ID?${NC}"
echo "(Find it at chrome://extensions with Developer mode ON)"
echo ""
read -p "Extension ID: " EXTENSION_ID

if [ -z "$EXTENSION_ID" ]; then
    echo -e "${RED}Error: Extension ID is required${NC}"
    echo ""
    echo "You can run the install command later:"
    echo "  $BINARY_NAME install <extension-id>"
    exit 1
fi

# Run install command
echo ""
echo "Installing native messaging host..."
"$INSTALL_DIR/$BINARY_NAME" install "$EXTENSION_ID"

# Trust certificate
echo ""
echo -e "${YELLOW}Do you want to trust the CA certificate now? (y/n)${NC}"
echo "(Required for HTTPS interception - you can do this later)"
read -p "> " TRUST_CERT

if [ "$TRUST_CERT" = "y" ] || [ "$TRUST_CERT" = "Y" ]; then
    "$INSTALL_DIR/$BINARY_NAME" trust-cert
fi

echo ""
echo -e "${GREEN}==============================${NC}"
echo -e "${GREEN}✅ Installation complete!${NC}"
echo -e "${GREEN}==============================${NC}"
echo ""
echo "Next steps:"
echo "1. Reload the Loggy extension in Chrome"
echo "2. Open the Loggy panel (DevTools > Loggy)"
echo "3. Click 'Start' to begin capturing events"
echo ""
