#!/bin/bash

# Build script for Loggy - combines prompt.txt into loggy.json

echo "🪵 Building Loggy slash command..."

# Read the prompt content
PROMPT_CONTENT=$(cat prompt.txt)

# Use jq to properly handle JSON escaping
jq --arg prompt "$PROMPT_CONTENT" '.prompt = $prompt' loggy.json > loggy-dist.json

echo "✅ Built loggy-dist.json"
echo "📦 Ready for distribution!"