# Universal Analytics Logger - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Analytics Logger Extension                       │
│                                                                      │
│  ┌────────────────┐         ┌──────────────────┐                   │
│  │                │         │                  │                   │
│  │  Panel UI      │◄────────│  SourceManager   │                   │
│  │  (panel.js)    │         │  (UI Logic)      │                   │
│  │                │         │                  │                   │
│  └────────┬───────┘         └──────────────────┘                   │
│           │                                                         │
│           │ chrome.runtime.sendMessage()                            │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │              Background Service Worker                   │       │
│  │                                                          │       │
│  │  ┌──────────────────┐      ┌────────────────────────┐  │       │
│  │  │                  │      │                        │  │       │
│  │  │  ConfigManager   │◄─────│  chrome.webRequest     │  │       │
│  │  │  (source mgmt)   │      │  (intercept network)   │  │       │
│  │  │                  │      │                        │  │       │
│  │  └────────┬─────────┘      └────────────────────────┘  │       │
│  │           │                          │                  │       │
│  │           │                          │                  │       │
│  │           ▼                          ▼                  │       │
│  │  ┌──────────────────┐      ┌────────────────────────┐  │       │
│  │  │                  │      │                        │  │       │
│  │  │  SourceConfig    │      │  AnalyticsParser       │  │       │
│  │  │  (pattern match) │      │  (parse payload)       │  │       │
│  │  │                  │      │                        │  │       │
│  │  └──────────────────┘      └────────────────────────┘  │       │
│  │                                                          │       │
│  │  ┌──────────────────────────────────────────────────┐  │       │
│  │  │                                                  │  │       │
│  │  │  chrome.storage.local                            │  │       │
│  │  │  (persist sources & events)                      │  │       │
│  │  │                                                  │  │       │
│  │  └──────────────────────────────────────────────────┘  │       │
│  └─────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                      MITM Proxy (Node.js)                            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │              proxy-server-mitm.js                        │       │
│  │                                                          │       │
│  │  ┌──────────────────┐      ┌────────────────────────┐  │       │
│  │  │                  │      │                        │  │       │
│  │  │ ConfigManagerNode│◄─────│  http-mitm-proxy       │  │       │
│  │  │ (same logic)     │      │  (intercept HTTPS)     │  │       │
│  │  │                  │      │                        │  │       │
│  │  └────────┬─────────┘      └────────────────────────┘  │       │
│  │           │                                             │       │
│  │           ▼                                             │       │
│  │  ┌──────────────────┐                                  │       │
│  │  │                  │                                  │       │
│  │  │  SourceConfig    │                                  │       │
│  │  │  (pattern match) │                                  │       │
│  │  │                  │                                  │       │
│  │  └──────────────────┘                                  │       │
│  │                                                          │       │
│  │  ┌──────────────────────────────────────────────────┐  │       │
│  │  │                                                  │  │       │
│  │  │  File System (config/proxy-sources.json)        │  │       │
│  │  │                                                  │  │       │
│  │  └──────────────────────────────────────────────────┘  │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┐          │
│  │  API Server (port 8889)                              │          │
│  │  - GET /events → Return captured events              │          │
│  │  - POST /clear → Clear events                        │          │
│  └──────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘

           │
           │ HTTP Poll (every 2 seconds)
           │
           ▼

┌─────────────────────────────────────────────────────────────────────┐
│              Extension Background (proxy mode)                       │
│  Polls http://localhost:8889/events for new events                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Extension Components

#### **Panel UI** (`panel/`)
- Display events in real-time
- Filter and search events
- Settings modal with tabs
- Source management UI
- Export events (JSON/CSV)

**Key File**: `panel.js` - Main UI controller

#### **Source Manager** (`panel/source-manager.js`)
- Tab switching logic
- Source CRUD operations
- Pattern builder UI
- Field mapping editor
- Import/export handlers
- Pattern testing

**Responsibilities**:
- User interactions with sources
- Form validation
- Communication with background

#### **Background Service Worker** (`background.js`)
- Intercept network requests
- Match URLs to sources
- Parse events using configured sources
- Store events in memory
- Real-time event notifications
- Settings management

**Key APIs**:
- `chrome.webRequest` - Intercept network
- `chrome.runtime.onMessage` - Handle UI requests
- `chrome.storage.local` - Persist data

#### **Config Manager** (`config/config-manager.js`)
- Load/save source configurations
- Match URLs to sources
- Auto-detect field mappings
- Import/export sources
- Statistics tracking

**Storage**: `chrome.storage.local.sourceConfig`

#### **Source Config** (`config/source-config.js`)
- Individual source representation
- Pattern matching logic
- Field extraction from payloads
- Visual identity (icon, color)
- Statistics tracking

**Pattern Types**:
- Contains: Simple substring match
- Regex: Regular expression
- Exact: Exact URL match

#### **Analytics Parser** (`parsers.js`)
- Parse different analytics formats
- Segment, Google Analytics, Reddit, GraphQL
- Generic parser using field mappings
- Extract structured data from payloads

**Parsers**:
- `parseSegment()` - Segment batch format
- `parseGoogleAnalytics()` - GA4 & UA
- `parseReddit()` - Reddit events
- `parseGraphQL()` - GraphQL queries
- `parseGenericJSON()` - Uses source field mappings

### Proxy Components

#### **MITM Proxy Server** (`proxy-server-mitm.js`)
- Intercept HTTPS traffic
- Uses same ConfigManager logic
- Parse events using source configs
- Expose API for extension polling

**Ports**:
- 8888: Proxy server
- 8889: API server

#### **Config Manager (Node)** (`config/config-manager-node.js`)
- Same logic as browser version
- Uses file system instead of chrome.storage
- Shares configuration model

**Storage**: `config/proxy-sources.json`

## Data Flow

### 1. Source Configuration Flow

```
User Action
    │
    ▼
SourceManager UI
    │ (collect form data)
    ▼
chrome.runtime.sendMessage({ action: 'addSource', source: {...} })
    │
    ▼
Background Service Worker
    │
    ▼
ConfigManager.addSource(source)
    │
    ├─► SourceConfig created
    │
    └─► chrome.storage.local.set({ sourceConfig: {...} })
```

### 2. Event Capture Flow (Extension)

```
Web Page makes POST request
    │
    ▼
chrome.webRequest.onBeforeRequest
    │
    ▼
ConfigManager.findSourceForUrl(url)
    │
    ├─► Iterate sources
    │   └─► SourceConfig.matches(url)
    │       └─► Check URL patterns
    │
    ▼
Source found ✅
    │
    ▼
AnalyticsParser.parseRequest(url, body, initiator, source)
    │
    ├─► Use source.parser
    │   └─► parseSegment() / parseReddit() / parseGenericJSON()
    │
    ├─► SourceConfig.extractFields(payload)
    │   └─► Apply field mappings
    │
    └─► Add source metadata (icon, color, name)
    │
    ▼
EventStorage.addEvents([event])
    │
    ▼
notifyPanels('eventsAdded', events)
    │
    ▼
Panel UI updates
```

### 3. Event Capture Flow (Proxy)

```
Browser makes HTTPS request through proxy
    │
    ▼
MITM Proxy intercepts
    │
    ▼
ConfigManagerNode.findSourceForUrl(url)
    │
    ▼
Source found ✅
    │
    ▼
parseEventFromSource(source, data, url)
    │
    └─► SourceConfig.extractFields(data)
    │
    ▼
Store in capturedEvents[]
    │
    ▼
Extension polls http://localhost:8889/events
    │
    ▼
New events received
    │
    ▼
Panel UI updates
```

### 4. Pattern Testing Flow

```
User clicks "Test Pattern"
    │
    ▼
SourceManager.testSource()
    │
    ├─► Collect patterns from form
    │
    ├─► Prompt for test URL
    │
    └─► Test each pattern locally
        │
        ├─► Contains: url.includes(pattern)
        ├─► Regex: new RegExp(pattern).test(url)
        └─► Exact: url === pattern
        │
        ▼
    Show result (✅ match or ❌ no match)
```

## Storage Schema

### chrome.storage.local

```javascript
{
  // Source configurations (user-created only)
  sourceConfig: {
    "my-app": {
      id: "my-app",
      name: "My App",
      enabled: true,
      urlPatterns: [...],
      fieldMappings: {...},
      parser: "generic",
      createdBy: "user",
      stats: {...}
    }
  },

  // General settings
  settings: {
    enabled: true,
    persistEvents: false,
    maxEvents: 1000,
    useProxy: false,
    urlPatterns: [...], // Legacy
  },

  // Captured events (if persistEvents: true)
  events: [...]
}
```

### File System (Proxy)

**config/proxy-sources.json**:
```javascript
{
  "my-app": {
    id: "my-app",
    name: "My App",
    // ... same schema as chrome.storage
  }
}
```

## API Endpoints

### Extension Messages

```javascript
// Sources
{ action: 'getSources' }
{ action: 'getSource', id: 'reddit' }
{ action: 'addSource', source: {...} }
{ action: 'updateSource', source: {...} }
{ action: 'removeSource', id: 'my-app' }
{ action: 'exportSources' }
{ action: 'importSources', data: jsonString }
{ action: 'resetSources' }
{ action: 'createSourceFromSample', url, payload }

// Events
{ action: 'getEvents', filters: {...} }
{ action: 'getAllEvents' }
{ action: 'clearEvents' }
{ action: 'exportJSON', filters: {...} }
{ action: 'exportCSV', filters: {...} }

// Settings
{ action: 'getSettings' }
{ action: 'updateSettings', settings: {...} }
```

### Proxy API

```
GET  http://localhost:8889/events
     → { events: [...], count: N }

POST http://localhost:8889/clear
     → { success: true }
```

## Class Hierarchy

```
SourceConfig
    ├── Properties
    │   ├── id, name, icon, color
    │   ├── enabled
    │   ├── urlPatterns[]
    │   ├── fieldMappings{}
    │   ├── parser
    │   └── stats{}
    │
    └── Methods
        ├── matches(url)
        ├── matchPattern(url, pattern)
        ├── extractFields(payload)
        ├── getNestedValue(obj, path)
        ├── recordCapture()
        └── toJSON()

ConfigManager
    ├── Properties
    │   ├── sources: Map<id, SourceConfig>
    │   └── fallback: SourceConfig
    │
    └── Methods
        ├── load()
        ├── save()
        ├── findSourceForUrl(url)
        ├── getSource(id)
        ├── getAllSources()
        ├── addSource(source)
        ├── removeSource(id)
        ├── createFromSample(url, payload)
        ├── guessFieldMappings(payload)
        ├── export()
        └── import(json)

SourceManager (UI)
    ├── Properties
    │   ├── sources[]
    │   ├── currentSource
    │   └── editingSourceId
    │
    └── Methods
        ├── loadSources()
        ├── renderSources()
        ├── openSourceEditor(source)
        ├── saveSource()
        ├── deleteSource()
        ├── testSource()
        ├── addPattern()
        ├── exportSources()
        └── importSources()
```

## Technology Stack

### Frontend
- **HTML5** - UI structure
- **CSS3** - Styling with gradients, flexbox
- **ES6 Modules** - Modular JavaScript
- **Chrome Extension APIs** - chrome.runtime, chrome.storage, chrome.webRequest

### Backend (Proxy)
- **Node.js** - Runtime
- **http-mitm-proxy** - HTTPS interception
- **http** - API server
- **fs** - File system storage

### Data
- **JSON** - Configuration format
- **chrome.storage.local** - Browser storage
- **File System** - Proxy config persistence

## Security Considerations

### Extension Permissions
- `webRequest` - Intercept network requests
- `storage` - Persist configurations
- `<all_urls>` - Monitor all URLs

### MITM Proxy
- Requires trusted CA certificate
- Only intercepts when running
- Local traffic only (localhost:8888)

### Data Privacy
- All data stored locally
- No external services
- User controls what's captured

## Performance

### Extension
- Lazy loading of sources
- In-memory source cache
- Efficient pattern matching
- Ring buffer for events (max 1000 by default)

### Proxy
- Streaming request processing
- Limited event storage (max 1000)
- Minimal CPU usage
- No disk I/O during capture

## Extensibility

### Adding New Parsers
1. Add parser function to `parsers.js`
2. Add case to `parseRequest()`
3. Add option to source editor dropdown
4. Document in guide

### Adding Default Sources
1. Edit `config/default-sources.js`
2. Add entry to `DEFAULT_SOURCES`
3. Restart extension

### Custom UI
- Modular CSS
- Event-driven architecture
- Extensible message API

---

**Architecture Status**: ✅ Production Ready
