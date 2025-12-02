# Source Configuration Guide

## Overview

The Analytics Logger now features a **universal configuration system** that allows you to capture analytics events from ANY web application without modifying code. Simply configure URL patterns and field mappings through the UI!

## Quick Start

### 1. Open Settings
Click the ⚙️ icon in the extension panel to open settings.

### 2. Navigate to Sources Tab
The settings modal has three tabs:
- **General**: Basic extension settings
- **Sources**: Analytics source configuration ⭐
- **Proxy**: MITM proxy settings

Click the "Sources" tab to manage analytics sources.

### 3. Pre-Configured Sources

The extension comes with **12 pre-configured sources**:
- 🔵 Reddit
- 📊 Segment
- 📈 Google Analytics
- 🔮 Mixpanel
- 📡 Amplitude
- 🥧 Pie
- 🔥 Heap
- 🦔 PostHog
- ❄️ Snowplow
- 🚢 RudderStack
- 📘 Facebook Pixel
- 💬 Intercom

These work out-of-the-box with zero configuration!

## Creating a Custom Source

### Step 1: Click "Add Source"

In the Sources tab, click the **"+ Add Source"** button.

### Step 2: Configure Basic Info

**Name**: Human-readable name (e.g., "My App Analytics")
**Icon**: Emoji to identify the source (e.g., ⚡, 🎯, 📊)
**Color**: Color for visual identification (click to pick)
**Enabled**: Toggle to enable/disable capture

### Step 3: Add URL Patterns

URL patterns determine which requests to intercept. Click **"+ Add Pattern"** to add patterns.

Each pattern has a **type**:

#### Contains (Most Common)
Matches if the URL contains the pattern.
```
Pattern: reddit.com/events
Matches: https://www.reddit.com/svc/shreddit/events
Matches: https://reddit.com/events
```

#### Regex (Advanced)
Uses regular expressions for complex matching.
```
Pattern: my-app\.com/api/(analytics|track)
Matches: https://my-app.com/api/analytics
Matches: https://my-app.com/api/track
```

#### Exact
Must match the URL exactly (rarely used).
```
Pattern: https://api.example.com/v1/events
Matches: https://api.example.com/v1/events (only)
```

**Pro Tip**: Start with "Contains" patterns. They're simpler and cover 95% of use cases.

### Step 4: Select Parser

Choose how to parse the request payload:

- **Generic** (Recommended): Auto-detects fields using field mappings
- **Segment**: For Segment-compatible APIs
- **Reddit**: For Reddit's event format
- **Google Analytics**: For GA endpoints
- **GraphQL**: For GraphQL requests

**For most custom apps, use "Generic"** with field mappings.

### Step 5: Configure Field Mappings

Field mappings tell the parser where to find event data in the JSON payload. Enter field names as **comma-separated lists** (tried in order).

#### Example: Custom App

Your app sends:
```json
{
  "eventType": "button_click",
  "ts": 1234567890,
  "user": {
    "id": "user123"
  }
}
```

**Field Mappings**:
- Event Name: `eventType, event, action`
- Timestamp: `ts, timestamp, time`
- User ID: `user.id, userId, uid`

The parser will:
1. Try `eventType` → ✅ Found! Use "button_click"
2. Try `ts` → ✅ Found! Use 1234567890
3. Try `user.id` → ✅ Found! Use "user123"

#### Common Field Names

**Event Name**:
```
event, eventName, event_name, action, type, eventType, name
```

**Timestamp**:
```
timestamp, time, ts, sentAt, client_timestamp, event_timestamp, created_at
```

**User ID**:
```
user_id, userId, uid, user.id, distinct_id, anonymous_id, anonymousId
```

### Step 6: Test Your Pattern

Before saving, click **"Test Pattern"** to verify your URL patterns work.

1. Click "Test Pattern"
2. Enter a sample URL
3. See if it matches ✅ or doesn't match ❌

### Step 7: Save

Click **"Save"** to activate your source!

## Editing Sources

Click any source card in the Sources tab to edit it. You can:
- Update patterns
- Change field mappings
- Enable/disable the source
- View statistics (events captured)

## Import/Export

### Export Sources
Share your custom source configurations with your team:

1. Click **"Export"** in Sources tab
2. Save the JSON file
3. Share with teammates

### Import Sources
Import sources from a teammate or backup:

1. Click **"Import"** in Sources tab
2. Select the JSON file
3. Sources are automatically added

## Real-World Examples

### Example 1: Custom Analytics Endpoint

**App**: SaaS Dashboard
**Endpoint**: `https://api.myapp.com/analytics/track`
**Payload**:
```json
{
  "event": "feature_used",
  "timestamp": "2025-01-15T10:30:00Z",
  "user_id": "abc123",
  "properties": {
    "feature": "export",
    "plan": "pro"
  }
}
```

**Configuration**:
- Name: My App Analytics
- Icon: 🎯
- Pattern: `api.myapp.com/analytics` (Contains)
- Parser: Generic
- Event Name: `event`
- Timestamp: `timestamp`
- User ID: `user_id`

### Example 2: Multiple Endpoints

**App**: Multi-service platform
**Endpoints**:
- `https://api.app.com/v1/events`
- `https://api.app.com/v2/track`
- `https://analytics.app.com/log`

**Configuration**:
Add multiple patterns:
1. `api.app.com/v1/events` (Contains)
2. `api.app.com/v2/track` (Contains)
3. `analytics.app.com/log` (Contains)

### Example 3: Complex Regex Pattern

**App**: Legacy system with varying URLs
**URLs**:
- `https://old.app.com/log?format=json`
- `https://new.app.com/api/log?format=json`

**Configuration**:
- Pattern: `app\.com/(api/)?log\?format=json` (Regex)
- Matches both old and new URLs

## Tips & Best Practices

### 1. Start Simple
Begin with a single "Contains" pattern. Add more patterns only if needed.

### 2. Use Multiple Field Names
List field names in order of preference:
```
Event Name: eventType, event, action, type
```
This makes your config robust to API changes.

### 3. Test Before Deploying
Always use the "Test Pattern" feature before saving.

### 4. Monitor Statistics
Check "Events Captured" in source cards to verify your patterns are working.

### 5. Export Your Config
Regularly export your custom sources as a backup.

### 6. One Source Per Service
Create separate sources for different services (e.g., "Backend API" vs "Frontend Analytics").

### 7. Use Colors & Icons
Assign meaningful colors and icons to quickly identify sources in the event feed.

## Troubleshooting

### "No events captured"

**Check**:
1. Is the source enabled? (check source card)
2. Do your URL patterns match the actual request URLs?
3. Try the "Test Pattern" feature with actual URLs

**Debug**:
1. Open Chrome DevTools → Console
2. Look for `[Analytics Logger]` logs
3. Check if requests are being matched

### "Events captured but fields are empty"

**Check**:
1. Are your field mappings correct?
2. Use Chrome DevTools → Network tab to inspect the actual JSON payload
3. Verify field names match exactly (case-sensitive)

**Fix**:
Update field mappings to match the actual payload structure.

### "Pattern test passes but no events in production"

**Check**:
1. Is the extension enabled? (General tab)
2. For HTTPS traffic, is the MITM proxy running? (Proxy tab)
3. Check the request method (must be POST for most sources)

## Advanced: Creating From Sample Events

**Coming Soon**: Click "+" on unknown events to auto-create source configurations!

## Architecture

### How It Works

```
1. Request Intercepted
   ↓
2. URL Matched Against Sources
   ↓
3. Parser Applied Based on Source Config
   ↓
4. Fields Extracted Using Field Mappings
   ↓
5. Event Displayed in Panel
```

### Where Configs Are Stored

- **Default Sources**: Built into the extension
- **Custom Sources**: Stored in `chrome.storage.local`
- **Proxy**: Shares same config via `config/proxy-sources.json`

### Benefits

✅ **Universal**: Works with ANY analytics platform
✅ **Zero-Code**: Configure through UI
✅ **Shareable**: Export/import JSON configs
✅ **Maintainable**: Update patterns without code changes
✅ **Testable**: Built-in pattern tester
✅ **Unified**: Same config for extension AND proxy

## API Reference

### Message API

The extension exposes these actions:

```javascript
// Get all sources
chrome.runtime.sendMessage({ action: 'getSources' })

// Get single source
chrome.runtime.sendMessage({ action: 'getSource', id: 'reddit' })

// Add source
chrome.runtime.sendMessage({ action: 'addSource', source: { ... } })

// Update source
chrome.runtime.sendMessage({ action: 'updateSource', source: { ... } })

// Delete source
chrome.runtime.sendMessage({ action: 'removeSource', id: 'my-source' })

// Export sources
chrome.runtime.sendMessage({ action: 'exportSources' })

// Import sources
chrome.runtime.sendMessage({ action: 'importSources', data: jsonString })
```

### Source Schema

```javascript
{
  id: "my-app",              // Unique identifier
  name: "My App",            // Display name
  icon: "⚡",                // Emoji icon
  color: "#6366F1",          // Hex color
  enabled: true,             // Enable/disable
  urlPatterns: [             // URL patterns
    { pattern: "api.myapp.com", type: "contains" }
  ],
  fieldMappings: {           // Field extraction
    eventName: ["event", "eventType"],
    timestamp: ["timestamp", "ts"],
    userId: ["user_id"],
    properties: "all"        // Include all other fields
  },
  parser: "generic",         // Parser type
  createdBy: "user",         // "user" or "system"
  createdAt: "2025-01-15...", // ISO timestamp
  stats: {                   // Statistics
    eventsCapture: 1234,
    lastCaptured: "2025-01-15..."
  }
}
```

## Questions?

Open an issue on GitHub or check the [main README](../README.md).
