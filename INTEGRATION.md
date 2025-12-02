# Integrating with Your Pie Extension

Since Chrome extensions can't intercept each other's network requests from service workers, you need to add a small helper to your Pie extension to send events directly to the Analytics Logger.

## Quick Setup (5 minutes)

### Step 1: Get Analytics Logger Extension ID

1. Go to `chrome://extensions/`
2. Find "Extension Analytics Logger"
3. Copy the extension ID (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

### Step 2: Add Helper to Pie Extension

**Option A: Automatic (Monkey-patch)**

1. Copy `pie-extension-helper.js` to your Pie extension directory
2. Open `pie-extension-helper.js` and replace `YOUR_ANALYTICS_LOGGER_EXTENSION_ID_HERE` with the ID from Step 1
3. Import it in your service worker (usually `background.js` or `service-worker.js`):
   ```javascript
   import './pie-extension-helper.js';
   ```
4. Reload your Pie extension

**Option B: Manual Logging**

Add this snippet wherever you track events in your Pie extension:

```javascript
const ANALYTICS_LOGGER_ID = 'your-analytics-logger-id-here';

function logEvent(event, properties) {
  chrome.runtime.sendMessage(ANALYTICS_LOGGER_ID, {
    event,
    properties,
    timestamp: new Date().toISOString(),
    source: 'pie-extension'
  }).catch(() => {});
}

// Use it:
analytics.track('ext_popover_opened', { source: 'sidebar' });
logEvent('ext_popover_opened', { source: 'sidebar' }); // Add this line
```

### Step 3: Test

1. Reload Analytics Logger extension
2. Reload Pie extension
3. Open Analytics Logger side panel
4. Trigger an event in Pie (e.g., open popover)
5. Event should appear immediately in Analytics Logger!

## Verification

In the Analytics Logger service worker console, you should see:
```
[Analytics Logger] Received message: event
[Analytics Logger] Direct event from extension: jpkfgepcmmchgfbjblnodjhldacghenp
```

In the Pie extension console, you should see:
```
[Pie→Analytics Logger] Sent event: ext_popover_opened
```

## Troubleshooting

### Events not appearing?

1. **Check extension IDs match**: Make sure the ID in your helper matches the actual Analytics Logger ID
2. **Check externally_connectable**: Analytics Logger manifest should have `"externally_connectable": { "ids": ["*"] }`
3. **Check both are loaded**: Both extensions should show as enabled in `chrome://extensions/`
4. **Check console logs**: Look for error messages in both service worker consoles

### How to find service worker consoles?

1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Under each extension, click "Inspect views: service worker"

## Why This Approach?

Chrome doesn't allow extensions to intercept network requests from other extensions' service workers for security/privacy reasons. Direct messaging is the only reliable way to share data between extensions locally.

## Production Note

For production, you'd typically:
1. Use Segment's native SDK (which you're already doing)
2. Only enable Analytics Logger in development
3. Or build Analytics Logger as a DevTools panel that uses the same approach
