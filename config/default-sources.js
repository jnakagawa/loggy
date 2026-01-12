/**
 * Default Analytics Source Configurations
 *
 * Pre-configured sources for popular analytics platforms.
 * These are loaded by default and can be customized by users.
 *
 * New format:
 * - `domain`: Base domain to match (e.g., "segment.io" matches api.segment.io, cdn.segment.io, etc.)
 * - `fieldMappings`: OPTIONAL overrides for auto-detection (only set if parser gets it wrong)
 */

export const DEFAULT_SOURCES = {
  'reddit': {
    name: 'Reddit',
    color: '#FF4500',
    icon: '🔵',
    enabled: true,
    domain: 'reddit.com',
    createdBy: 'system'
  },

  'pie': {
    name: 'Pie',
    color: '#FF6B6B',
    icon: '🥧',
    enabled: true,
    domain: 'pie.org',
    createdBy: 'system'
  },

  'honey': {
    name: 'Honey',
    color: '#FF6B00',
    icon: '🍯',
    enabled: true,
    domain: 'joinhoney.com',
    fieldMappings: {
      eventName: 'code',
      timestamp: 'client_ts'
    },
    createdBy: 'system'
  },

  'chatgpt': {
    name: 'ChatGPT',
    color: '#10A37F',
    icon: '🤖',
    enabled: true,
    domain: 'openai.com',
    createdBy: 'system'
  },

  'grammarly': {
    name: 'Grammarly',
    color: '#15C39A',
    icon: '✍️',
    enabled: true,
    domain: 'grammarly.com',
    createdBy: 'system'
  }
};

/**
 * Analytics-like endpoint patterns
 * Used to detect potential analytics requests from unknown domains
 * When a POST with JSON body matches these patterns, suggest adding as source
 */
export const ANALYTICS_ENDPOINT_PATTERNS = [
  '/analytics',
  '/events',
  '/track',
  '/collect',
  '/log',
  '/beacon',
  '/v1/batch',
  '/v1/track',
  '/evs',
  '/telemetry',
  '/metrics'
];

/**
 * Check if a URL path looks like an analytics endpoint
 * @param {string} url - Full URL to check
 * @returns {boolean} - True if URL matches analytics patterns
 */
export function looksLikeAnalyticsEndpoint(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    return ANALYTICS_ENDPOINT_PATTERNS.some(pattern => path.includes(pattern));
  } catch {
    return false;
  }
}
