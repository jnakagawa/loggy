// Event Storage System with Ring Buffer

export class EventStorage {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.events = [];
    this.listeners = new Set();
  }

  /**
   * Add a new event to storage
   */
  addEvent(event) {
    // Add to beginning of array (newest first)
    this.events.unshift(event);

    // Maintain max size (ring buffer behavior)
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(0, this.maxSize);
    }

    // Notify listeners
    this.notifyListeners('add', event);

    return event;
  }

  /**
   * Add multiple events at once
   */
  addEvents(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    // Add all events
    this.events.unshift(...events);

    // Maintain max size
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(0, this.maxSize);
    }

    // Notify listeners
    this.notifyListeners('addBatch', events);
  }

  /**
   * Get all events
   */
  getAllEvents() {
    return [...this.events];
  }

  /**
   * Get events with filtering
   */
  getEvents(filters = {}) {
    let filtered = [...this.events];

    // Filter by event type
    if (filters.event) {
      const searchTerm = filters.event.toLowerCase();
      filtered = filtered.filter(e =>
        e.event && e.event.toLowerCase().includes(searchTerm)
      );
    }

    // Filter by parser/source
    if (filters.parser) {
      filtered = filtered.filter(e =>
        e._parser === filters.parser
      );
    }

    // Filter by URL
    if (filters.url) {
      const urlSearch = filters.url.toLowerCase();
      filtered = filtered.filter(e =>
        e._metadata?.url && e._metadata.url.toLowerCase().includes(urlSearch)
      );
    }

    // Filter by time range
    if (filters.startTime) {
      filtered = filtered.filter(e =>
        new Date(e.timestamp) >= new Date(filters.startTime)
      );
    }

    if (filters.endTime) {
      filtered = filtered.filter(e =>
        new Date(e.timestamp) <= new Date(filters.endTime)
      );
    }

    // Full-text search in properties
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(e => {
        const searchString = JSON.stringify({
          event: e.event,
          properties: e.properties,
          context: e.context
        }).toLowerCase();
        return searchString.includes(searchTerm);
      });
    }

    // Limit results
    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Get event by ID
   */
  getEventById(id) {
    return this.events.find(e => e.id === id);
  }

  /**
   * Clear all events from memory only
   */
  clear() {
    this.events = [];
    this.notifyListeners('clear');
  }

  /**
   * Clear all events from both memory and persistent storage
   */
  async clearAll() {
    this.events = [];
    this.notifyListeners('clear');

    try {
      await chrome.storage.local.remove(['events', 'savedAt']);
      console.log('[Storage] Cleared persisted events from chrome.storage.local');
      return true;
    } catch (err) {
      console.error('[Storage] Error clearing persistent storage:', err);
      return false;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      total: this.events.length,
      byParser: {},
      byEvent: {},
      timeRange: {
        oldest: null,
        newest: null
      }
    };

    this.events.forEach(event => {
      // Count by parser
      const parser = event._parser || 'unknown';
      stats.byParser[parser] = (stats.byParser[parser] || 0) + 1;

      // Count by event type
      const eventName = event.event || 'unknown';
      stats.byEvent[eventName] = (stats.byEvent[eventName] || 0) + 1;

      // Track time range
      const timestamp = new Date(event.timestamp);
      if (!stats.timeRange.oldest || timestamp < new Date(stats.timeRange.oldest)) {
        stats.timeRange.oldest = event.timestamp;
      }
      if (!stats.timeRange.newest || timestamp > new Date(stats.timeRange.newest)) {
        stats.timeRange.newest = event.timestamp;
      }
    });

    return stats;
  }

  /**
   * Export events as JSON
   */
  exportJSON(filters = {}) {
    const events = this.getEvents(filters);
    return JSON.stringify(events, null, 2);
  }

  /**
   * Export events as CSV
   */
  exportCSV(filters = {}) {
    const events = this.getEvents(filters);
    if (events.length === 0) {
      return '';
    }

    // CSV headers
    const headers = [
      'ID',
      'Timestamp',
      'Event',
      'Type',
      'Parser',
      'URL',
      'Properties',
      'User ID',
      'Anonymous ID'
    ];

    // CSV rows
    const rows = events.map(event => [
      event.id,
      event.timestamp,
      event.event || '',
      event.type || '',
      event._parser || '',
      event._metadata?.url || '',
      JSON.stringify(event.properties || {}),
      event.userId || '',
      event.anonymousId || ''
    ]);

    // Build CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Register a listener for storage changes
   */
  addListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * Unregister a listener
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of changes
   */
  notifyListeners(action, data) {
    this.listeners.forEach(listener => {
      try {
        listener({ action, data, stats: this.getStats() });
      } catch (err) {
        console.error('Error notifying listener:', err);
      }
    });
  }

  /**
   * Save events to chrome.storage.local (persistence)
   */
  async saveToStorage() {
    try {
      await chrome.storage.local.set({
        events: this.events,
        savedAt: new Date().toISOString()
      });
      return true;
    } catch (err) {
      console.error('Error saving to storage:', err);
      return false;
    }
  }

  /**
   * Load events from chrome.storage.local
   */
  async loadFromStorage() {
    try {
      const result = await chrome.storage.local.get(['events', 'savedAt']);
      if (result.events && Array.isArray(result.events)) {
        this.events = result.events;
        this.notifyListeners('load', { savedAt: result.savedAt });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error loading from storage:', err);
      return false;
    }
  }

  /**
   * Get current size and capacity
   */
  getSize() {
    return {
      current: this.events.length,
      max: this.maxSize,
      percentage: (this.events.length / this.maxSize) * 100
    };
  }

  /**
   * Update max size
   */
  setMaxSize(newSize) {
    this.maxSize = newSize;
    if (this.events.length > newSize) {
      this.events = this.events.slice(0, newSize);
      this.notifyListeners('resize', { maxSize: newSize });
    }
  }
}
