# Quick Start - One-Liners

## Option 1: Manual Proxy (Simplest) ⚡

**All-in-one command:**
```bash
cd extension-analytics-logger && npm start & npm run chrome
```

Or step by step:

**Start the proxy:**
```bash
npm start
```

**Launch Chrome with proxy:**
```bash
npm run chrome
```

**Enable in UI:**
1. Load extension in the new Chrome window
2. Open Analytics Logger → Settings
3. Check "Enable Proxy Mode"
4. Save Settings

## Option 2: Auto-Start from Extension (Advanced) 🚀

**One-time setup:**
```bash
cd extension-analytics-logger
./install-native-host.sh
# Enter your extension ID when prompted
```

**Then use the UI:**
1. Reload the extension
2. Open Settings
3. Click "Start Proxy" button
4. Run `npm run chrome` in terminal
5. Check "Enable Proxy Mode"

The native host lets the extension start the proxy automatically!

## Super Quick All-in-One

```bash
cd extension-analytics-logger && npm start &
npm run chrome
```

This starts the proxy in background and opens Chrome with proxy in one command!

## Verify It's Working

1. Open Analytics Logger side panel
2. Go to Settings → Enable "Proxy Mode"
3. Use your Pie extension
4. Events appear automatically!

## Stop Everything

Kill the proxy:
```bash
# If you started with npm start
pkill -f proxy-server.js

# Or just Ctrl+C in the terminal
```

Close the Chrome window with proxy (it's a separate profile).

## Daily Workflow

```bash
# Morning:
cd extension-analytics-logger && npm start

# In another terminal or background:
npm run chrome

# Enable Proxy Mode in Analytics Logger settings

# Work normally...

# Evening:
# Just close Chrome and Ctrl+C the proxy
```

## Troubleshooting One-Liners

Check if proxy is running:
```bash
lsof -i :8888
```

Check if API server is running:
```bash
curl http://localhost:8889/events
```

Kill stuck processes:
```bash
pkill -f proxy-server.js
lsof -ti:8888 | xargs kill -9
lsof -ti:8889 | xargs kill -9
```
