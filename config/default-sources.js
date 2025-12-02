/**
 * Default Analytics Source Configurations
 *
 * Pre-configured sources for popular analytics platforms.
 * These are loaded by default and can be customized by users.
 */

export const DEFAULT_SOURCES = {
  'reddit': {
    name: 'Reddit',
    color: '#FF4500',
    icon: '🔵',
    enabled: true,
    urlPatterns: [
      { pattern: 'reddit.com/events', type: 'contains' },
      { pattern: 'reddit.com/svc/shreddit/events', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['action', 'event', 'noun'],
      timestamp: ['client_timestamp', 'timestamp'],
      userId: ['user_id'],
      properties: 'all'
    },
    parser: 'reddit',
    createdBy: 'system'
  },

  'segment': {
    name: 'Segment',
    color: '#52BD95',
    icon: '📊',
    enabled: true,
    urlPatterns: [
      { pattern: 'segment.io/v1/', type: 'contains' },
      { pattern: 'segment.com/v1/', type: 'contains' },
      { pattern: '/v1/batch', type: 'contains' },
      { pattern: '/v1/track', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['event', 'type'],
      timestamp: ['timestamp', 'sentAt'],
      userId: ['userId', 'anonymousId'],
      properties: 'properties'
    },
    parser: 'segment',
    createdBy: 'system'
  },

  'google-analytics': {
    name: 'Google Analytics',
    color: '#F9AB00',
    icon: '📈',
    enabled: true,
    urlPatterns: [
      { pattern: 'google-analytics.com', type: 'contains' },
      { pattern: 'analytics.google.com', type: 'contains' },
      { pattern: '/collect', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['name', 'ea', 't'],
      timestamp: ['timestamp'],
      userId: ['user_id', 'uid'],
      properties: 'all'
    },
    parser: 'google-analytics',
    createdBy: 'system'
  },

  'mixpanel': {
    name: 'Mixpanel',
    color: '#7856FF',
    icon: '🔮',
    enabled: true,
    urlPatterns: [
      { pattern: 'mixpanel.com/track', type: 'contains' },
      { pattern: 'api.mixpanel.com', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['event'],
      timestamp: ['time'],
      userId: ['distinct_id'],
      properties: 'properties'
    },
    parser: 'generic',
    createdBy: 'system'
  },

  'amplitude': {
    name: 'Amplitude',
    color: '#0088FF',
    icon: '📡',
    enabled: true,
    urlPatterns: [
      { pattern: 'amplitude.com/2/httpapi', type: 'contains' },
      { pattern: 'api.amplitude.com', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['event_type'],
      timestamp: ['time'],
      userId: ['user_id', 'device_id'],
      properties: 'event_properties'
    },
    parser: 'generic',
    createdBy: 'system'
  },

  'pie': {
    name: 'Pie',
    color: '#FF6B6B',
    icon: '🥧',
    enabled: true,
    urlPatterns: [
      { pattern: 'pie.org/v1/batch', type: 'contains' },
      { pattern: 'pie-staging.org/v1/batch', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['event', 'type'],
      timestamp: ['timestamp', 'sentAt'],
      userId: ['userId', 'anonymousId'],
      properties: 'properties'
    },
    parser: 'segment', // Uses Segment format
    createdBy: 'system'
  },

  'heap': {
    name: 'Heap',
    color: '#FF5A5F',
    icon: '🔥',
    enabled: true,
    urlPatterns: [
      { pattern: 'heapanalytics.com/api/track', type: 'contains' },
      { pattern: 'heap.io/api/', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['event'],
      timestamp: ['time'],
      userId: ['identity'],
      properties: 'all'
    },
    parser: 'generic',
    createdBy: 'system'
  },

  'posthog': {
    name: 'PostHog',
    color: '#1D4AFF',
    icon: '🦔',
    enabled: true,
    urlPatterns: [
      { pattern: 'posthog.com/capture', type: 'contains' },
      { pattern: 'app.posthog.com', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['event'],
      timestamp: ['timestamp'],
      userId: ['distinct_id'],
      properties: 'properties'
    },
    parser: 'generic',
    createdBy: 'system'
  },

  'snowplow': {
    name: 'Snowplow',
    color: '#6638F0',
    icon: '❄️',
    enabled: true,
    urlPatterns: [
      { pattern: '/com.snowplowanalytics', type: 'contains' },
      { pattern: '/i?', type: 'regex' }
    ],
    fieldMappings: {
      eventName: ['e', 'event'],
      timestamp: ['dtm', 'timestamp'],
      userId: ['uid'],
      properties: 'all'
    },
    parser: 'generic',
    createdBy: 'system'
  },

  'rudderstack': {
    name: 'RudderStack',
    color: '#FF6B35',
    icon: '🚢',
    enabled: true,
    urlPatterns: [
      { pattern: 'rudderstack.com/v1/', type: 'contains' },
      { pattern: '/v1/track', type: 'contains' },
      { pattern: '/v1/batch', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['event', 'type'],
      timestamp: ['timestamp'],
      userId: ['userId', 'anonymousId'],
      properties: 'properties'
    },
    parser: 'segment', // Compatible with Segment
    createdBy: 'system'
  },

  'facebook-pixel': {
    name: 'Facebook Pixel',
    color: '#1877F2',
    icon: '📘',
    enabled: true,
    urlPatterns: [
      { pattern: 'facebook.com/tr', type: 'contains' },
      { pattern: 'connect.facebook.net', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['ev', 'event'],
      timestamp: ['timestamp'],
      userId: ['external_id'],
      properties: 'all'
    },
    parser: 'generic',
    createdBy: 'system'
  },

  'intercom': {
    name: 'Intercom',
    color: '#1F8DED',
    icon: '💬',
    enabled: true,
    urlPatterns: [
      { pattern: 'intercom.io/ember/events', type: 'contains' },
      { pattern: 'api.intercom.io', type: 'contains' }
    ],
    fieldMappings: {
      eventName: ['event_name'],
      timestamp: ['created_at'],
      userId: ['user_id'],
      properties: 'metadata'
    },
    parser: 'generic',
    createdBy: 'system'
  }
};

/**
 * Fallback configuration for unknown sources
 * Matches common analytics endpoint patterns
 */
export const FALLBACK_CONFIG = {
  name: 'Generic Analytics',
  color: '#6B7280',
  icon: '📊',
  enabled: true,
  urlPatterns: [
    { pattern: '/analytics', type: 'contains' },
    { pattern: '/events', type: 'contains' },
    { pattern: '/track', type: 'contains' },
    { pattern: '/collect', type: 'contains' },
    { pattern: '/log', type: 'contains' },
    { pattern: '/beacon', type: 'contains' }
  ],
  fieldMappings: {
    eventName: ['event', 'eventName', 'event_name', 'name', 'type', 'action'],
    timestamp: ['timestamp', 'time', 'ts', 'sentAt', 'client_timestamp'],
    userId: ['user_id', 'userId', 'uid', 'distinct_id'],
    properties: 'all'
  },
  parser: 'generic',
  createdBy: 'system'
};
