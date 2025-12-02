# Quick Setup Guide

## Icon Setup (Optional)

The extension references icon files in `manifest.json` but will work without them (Chrome uses default icons). To add custom icons:

1. Create three PNG files in the `icons/` directory:
   - `icon16.png` (16x16px)
   - `icon48.png` (48x48px)
   - `icon128.png` (128x128px)

2. Or, remove the `icons` section from `manifest.json` to use default Chrome icons.

## Installation Steps

1. **Open Chrome Extensions**
   ```
   Navigate to: chrome://extensions/
   ```

2. **Enable Developer Mode**
   - Toggle the switch in the top-right corner

3. **Load Extension**
   - Click "Load unpacked"
   - Select this directory: `extension-analytics-logger`

4. **Verify Installation**
   - Extension should appear in the extensions list
   - Click the extension icon to open the side panel

## Testing the Extension

### Test with Pie Shopping Extension

1. Open the Analytics Logger side panel
2. Use your Pie shopping extension (open popover, chat, etc.)
3. Watch events appear in real-time
4. Click events to expand and see full details

### Manual Test

If you want to test without other extensions:

1. Open DevTools Console
2. Run this code to simulate an analytics request:
   ```javascript
   fetch('https://api.segment.io/v1/track', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       event: 'test_event',
       properties: { test: true },
       timestamp: new Date().toISOString()
     })
   });
   ```
3. Check the Analytics Logger panel for the captured event

## Common Issues

### "Service worker registration failed"
- Make sure all JavaScript files are in the correct locations
- Check Console for specific error messages

### "Cannot read properties of undefined"
- Ensure all files from the project are present
- Verify file paths in `manifest.json` are correct

### Events Not Captured
- Check that "Enable Event Capture" is on in Settings
- Verify URL patterns include your analytics endpoints
- Check the background service worker console for errors

## Next Steps

1. Configure settings (⚙️ icon)
2. Set up URL patterns for your analytics services
3. Enable/disable specific parsers based on your needs
4. Adjust max events for your use case

## Updating the Extension

After making code changes:

1. Go to `chrome://extensions/`
2. Click the refresh icon on the Extension Analytics Logger card
3. Reload the side panel if it's open

---

**You're all set!** The extension is ready to capture analytics events.
