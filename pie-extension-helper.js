/**
 * Analytics Logger Helper for Pie Extension
 *
 * Add this file to your Pie extension and import it to automatically
 * send all analytics events to the Analytics Logger extension.
 *
 * Usage:
 * 1. Copy this file to your Pie extension
 * 2. Import at the top of your service worker or content script:
 *    import './pie-extension-helper.js';
 * 3. Get your Analytics Logger extension ID from chrome://extensions
 * 4. Update the ANALYTICS_LOGGER_ID constant below
 */

// TODO: Replace with your Analytics Logger extension ID
// Find it at chrome://extensions/ (toggle Developer mode, then click "Details")
const ANALYTICS_LOGGER_ID = 'YOUR_ANALYTICS_LOGGER_EXTENSION_ID_HERE';

// Enable/disable logging
const ENABLE_ANALYTICS_LOGGING = true;

/**
 * Send event to Analytics Logger
 */
function sendToAnalyticsLogger(event, properties = {}, metadata = {}) {
  if (!ENABLE_ANALYTICS_LOGGING) return;

  chrome.runtime.sendMessage(ANALYTICS_LOGGER_ID, {
    event,
    properties,
    timestamp: new Date().toISOString(),
    source: 'pie-extension',
    type: metadata.type || 'track',
    userId: metadata.userId,
    anonymousId: metadata.anonymousId,
    context: metadata.context || {}
  }).then(() => {
    console.log('[Pie→Analytics Logger] Sent event:', event);
  }).catch(err => {
    // Silent fail if Analytics Logger not installed
    console.log('[Pie→Analytics Logger] Not available:', err.message);
  });
}

/**
 * Automatically intercept analytics.track calls
 *
 * This monkey-patches the global analytics object to send events
 * to both Segment AND the Analytics Logger extension.
 */
if (typeof analytics !== 'undefined' && analytics.track) {
  console.log('[Pie→Analytics Logger] Hooking into analytics.track()');

  const originalTrack = analytics.track;

  analytics.track = function(event, properties, options, callback) {
    // Send to Analytics Logger
    sendToAnalyticsLogger(event, properties, {
      type: 'track',
      userId: analytics.user?.().id?.(),
      anonymousId: analytics.user?.().anonymousId?.()
    });

    // Call original Segment tracking
    return originalTrack.call(this, event, properties, options, callback);
  };
} else {
  console.warn('[Pie→Analytics Logger] analytics.track not found. Manual logging required.');
}

/**
 * Manual logging function (if analytics not available)
 *
 * Usage:
 * logEventManually('ext_popover_opened', { source: 'sidebar' });
 */
window.logEventManually = function(event, properties = {}) {
  sendToAnalyticsLogger(event, properties);
};

console.log('[Pie→Analytics Logger] Helper loaded');
