#!/bin/bash

# Start the Analytics Logger proxy server

cd "$(dirname "$0")"

echo "🚀 Starting Analytics Logger Proxy..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Start the proxy server
node proxy-server.js
