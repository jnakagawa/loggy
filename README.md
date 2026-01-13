# Extension Analytics Logger

A Chrome extension that automatically captures and displays analytics events from other Chrome extensions. Perfect for debugging, monitoring, and understanding what data your extensions are sending.

## Features

- **Automatic Capture**: Intercepts analytics requests from all extensions automatically
- **Multiple Formats**: Supports Segment, Google Analytics, GraphQL, and custom JSON formats
- **Real-time Display**: Events appear instantly in the side panel as they're captured
- **Advanced Filtering**: Search by event name, properties, URL, source, and more
- **Export Options**: Export captured events as JSON or CSV
- **Ring Buffer**: Configurable storage (default 1000 events) to prevent memory issues
- **Persistent Storage**: Optional persistence across browser restarts
- **Clean UI**: Beautiful, responsive side panel interface

## Supported Analytics Formats

- **Segment** (batch and track endpoints)
- **Google Analytics** (GA4 and Universal Analytics)
- **GraphQL** (with analytics payloads)
- **Custom JSON** (generic event detection)

## Installation

### From Source (Alpha Users)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `loggy` directory
6. The extension icon should appear in your toolbar

### Proxy Setup (Optional - for full HTTPS interception)

The proxy allows capturing analytics from sites that use compressed request bodies or sendBeacon:

1. Open the extension side panel
2. Click the "Setup" button next to Proxy status
3. Copy the terminal command and run it in Terminal (this installs dependencies automatically)
4. Reload the extension
5. Click "Start" to launch the proxy

**Note:** Requires Node.js to be installed.

### First-time Setup

1. Click the extension icon to open the side panel
2. Click the settings icon (⚙️) to configure capture settings
3. By default, all analytics sources are enabled

## Usage

### Viewing Events

1. Click the extension icon or navigate to the side panel
2. Events will appear automatically as they're captured
3. Click any event card to expand and see full details including:
   - Event properties
   - Context data
   - Full JSON payload
   - Timestamp and source information

### Filtering Events

- **Search**: Type in the search box to filter by event name, properties, or URL
- **Source Filter**: Select a specific analytics source (Segment, GA, GraphQL, etc.)
- **Event Type Filter**: Filter by specific event names
- **Clear Filters**: Reset all filters with one click

### Exporting Data

1. Apply filters if you want to export a subset of events
2. Click "Export JSON" for structured JSON data
3. Click "Export CSV" for spreadsheet-compatible format

### Settings

Access settings via the ⚙️ icon:

- **Enable/Disable Capture**: Toggle event capture on/off
- **Persist Events**: Save events to storage (survives browser restarts)
- **Max Events**: Set ring buffer size (100-10000 events)
- **URL Patterns**: Customize which URLs to monitor
- **Capture Sources**: Enable/disable specific analytics formats

## Example Use Cases

### 1. Debug Pie Shopping Extension

Monitor all analytics events from your Pie shopping extension:

1. Open the Analytics Logger side panel
2. Use Pie shopping extension normally
3. See all `ext_popover_opened`, `ext_ui`, `ext_chat` events in real-time
4. Expand events to inspect properties and context
5. Export events for analysis

### 2. Monitor All Extensions

View analytics from all your extensions:

1. Use Chrome normally with multiple extensions
2. Analytics Logger captures events from all sources
3. Use the Source filter to see events by parser type
4. Search for specific event names across all extensions

### 3. Export for Analysis

Export captured events for offline analysis:

1. Let events accumulate during a session
2. Apply filters to select relevant events
3. Export as JSON for programmatic analysis
4. Or export as CSV for Excel/Sheets analysis

## Architecture

```
┌─────────────────────────────────────┐
│   Background Service Worker         │
│   • Intercepts POST requests        │
│   • Parses analytics payloads       │
│   • Stores in ring buffer           │
│   • Broadcasts to side panel        │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│   Side Panel UI                     │
│   • Real-time event display         │
│   • Filtering & search              │
│   • Event details                   │
│   • Export functionality            │
└─────────────────────────────────────┘
```

## File Structure

```
extension-analytics-logger/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (network interception)
├── parsers.js            # Analytics payload parsers
├── storage.js            # Event storage with ring buffer
├── panel/
│   ├── panel.html        # Side panel HTML
│   ├── panel.js          # Side panel logic
│   └── panel.css         # Side panel styles
├── icons/                # Extension icons
└── README.md            # This file
```

## Permissions Explained

This extension requires the following permissions:

- **webRequest**: To intercept network requests and capture analytics data
- **storage**: To save settings and optionally persist events
- **tabs**: To access tab information for event metadata
- **sidePanel**: To display the event viewer in the side panel
- **host_permissions (`<all_urls>`)**: To monitor requests to all domains

## Privacy & Security

- **Local Only**: All data is stored locally in your browser
- **No External Servers**: This extension doesn't send data anywhere
- **No Tracking**: We don't track or collect any information
- **Open Source**: All code is visible and auditable

## Troubleshooting

### Events Not Appearing

1. Check that capture is enabled (Settings > Enable Event Capture)
2. Verify the analytics request matches your URL patterns
3. Check the Console for errors (right-click > Inspect)
4. Try refreshing the panel

### High Memory Usage

1. Reduce the max events setting (Settings > Max Events)
2. Clear old events regularly
3. Disable persistence if not needed

### Missing Event Details

Some analytics formats may not include all fields. The extension extracts as much data as possible from each request.

## Development

### Adding New Parsers

To add support for new analytics formats:

1. Edit `parsers.js`
2. Add a new parser method (e.g., `parseCustomFormat()`)
3. Add detection logic to `parseRequest()`
4. Test with sample requests

### Customizing UI

Edit `panel/panel.css` to customize the appearance. The UI uses CSS custom properties for easy theming.

## Contributing

Contributions are welcome! Areas for improvement:

- Additional analytics format parsers
- Performance optimizations
- UI enhancements
- Additional export formats
- Advanced filtering options

## License

MIT License - feel free to use and modify as needed.

## Support

For issues or questions:
- Check the Console for error messages
- Review the troubleshooting section
- Inspect the background worker: `chrome://extensions/` > Details > Inspect views: service worker

---

**Built for debugging and monitoring Chrome extension analytics events**
