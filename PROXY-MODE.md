# Proxy Mode - Capture Extension Events Without Modifications

This is the **recommended approach** for capturing analytics from extensions you can't modify (like Pie).

## Why This Works

Chrome extensions can't intercept each other's service worker requests due to security sandboxing. But a **local proxy** sits outside Chrome and can see ALL network traffic, including from extension service workers.

## Quick Setup (2 minutes)

### Step 1: Start the Proxy Server

```bash
cd extension-analytics-logger
node proxy-server.js
```

You should see:
```
🔌 Proxy server running on port 8888
📊 API server running on port 8889
⚡ Ready to intercept analytics events!
```

### Step 2: Launch Chrome with Proxy

**macOS/Linux:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --proxy-server="localhost:8888" \
  --user-data-dir="/tmp/chrome-proxy-profile"
```

**Windows:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --proxy-server="localhost:8888" ^
  --user-data-dir="C:\Temp\chrome-proxy-profile"
```

### Step 3: Enable Proxy Mode in Analytics Logger

1. In the new Chrome instance, go to `chrome://extensions/`
2. Load the "Extension Analytics Logger" extension (if not already loaded)
3. Open the Analytics Logger side panel
4. Click Settings ⚙️
5. Check "Enable Proxy Mode"
6. Click "Save Settings"

### Step 4: Use Your Extensions!

Use your Pie extension normally. Events will appear in Analytics Logger automatically!

## How It Works

```
┌─────────────────────┐
│  Pie Extension      │
│  (Service Worker)   │
└──────────┬──────────┘
           │ POST to s.pie.org/v1/batch
           ↓
┌─────────────────────┐
│  Local Proxy        │ ← Intercepts & logs all requests
│  localhost:8888     │
└──────────┬──────────┘
           │ Forwards to actual server
           ↓
┌─────────────────────┐
│  s.pie.org          │
└─────────────────────┘

Meanwhile:

┌─────────────────────┐
│  Analytics Logger   │
│  Extension          │ ← Polls http://localhost:8889/events
└─────────────────────┘   every 2 seconds
```

## Troubleshooting

### Chrome can't load extensions
The proxy profile is separate from your main Chrome profile. You'll need to:
1. Enable Developer mode in `chrome://extensions/`
2. Click "Load unpacked"
3. Select the `extension-analytics-logger` directory

### No events appearing?
1. Check proxy server is running (`node proxy-server.js`)
2. Verify Chrome is using the proxy: Go to any site, you should see requests in the proxy terminal
3. Make sure "Enable Proxy Mode" is checked in Analytics Logger settings
4. Check the service worker console for `[Analytics Logger] [Proxy] Received X new events`

### Proxy server crashes
Make sure port 8888 and 8889 are available:
```bash
lsof -i :8888
lsof -i :8889
```

Kill any processes using those ports, then restart the proxy.

### Events from websites, not extensions?
The proxy captures ALL requests. You can filter in Analytics Logger by:
- Using the search bar
- Filtering by event name
- Looking at the URL field in event details

## Production Note

This proxy is for **local development only**. For production monitoring:
- Use your analytics platform's native dashboard (Segment, Amplitude, etc.)
- Or integrate the Analytics Logger helper into your extensions (see `INTEGRATION.md`)

## Stopping the Proxy

1. Press `Ctrl+C` in the terminal running `proxy-server.js`
2. Close the Chrome instance with proxy
3. Disable "Proxy Mode" in Analytics Logger settings (if still using regular Chrome)

## Advanced: System-Wide Proxy

Instead of launching Chrome with --proxy-server, you can set your system proxy to localhost:8888. This will route ALL system traffic through the proxy (be careful with this approach).
