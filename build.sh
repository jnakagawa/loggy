#!/bin/bash
# Build script for Chrome Web Store distribution
# Creates a zip with all dependencies bundled

set -e

echo "Building Loggy for distribution..."

# Install dependencies
echo "Installing dependencies..."
npm install --production

# Create dist folder
rm -rf dist
mkdir -p dist

# Copy extension files
echo "Copying files..."
cp manifest.json dist/
cp background.js dist/
cp parsers.js dist/
cp storage.js dist/
cp setup.js dist/
cp SETUP-INSTRUCTIONS.html dist/
cp -r panel dist/
cp -r config dist/
cp -r native-host dist/
cp -r icons dist/ 2>/dev/null || true
cp -r node_modules dist/

# Create zip for Chrome Web Store
echo "Creating zip..."
cd dist
zip -r ../loggy-extension.zip . -x "*.DS_Store"
cd ..

echo ""
echo "Build complete!"
echo "  - dist/ folder contains the unpacked extension"
echo "  - loggy-extension.zip is ready for Chrome Web Store upload"
echo ""
ls -lh loggy-extension.zip
