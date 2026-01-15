package config

import (
	"net/url"
	"path"
	"strings"
)

// Source represents an analytics source configuration
type Source struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Icon          string            `json:"icon"`
	Color         string            `json:"color"`
	Enabled       bool              `json:"enabled"`
	Domain        string            `json:"domain"`
	URLPattern    string            `json:"urlPattern,omitempty"`
	FieldMappings map[string]string `json:"fieldMappings,omitempty"`
	EventNamePath string            `json:"eventNamePath,omitempty"`
	BatchPath     string            `json:"batchPath,omitempty"`
}

// Matches checks if a URL matches this source
func (s *Source) Matches(urlStr string) bool {
	if !s.Enabled {
		return false
	}

	u, err := url.Parse(urlStr)
	if err != nil {
		return false
	}

	// Extract base domain
	urlDomain := extractBaseDomain(u.Hostname())
	sourceDomain := strings.ToLower(s.Domain)

	if urlDomain != sourceDomain {
		return false
	}

	// Check URL pattern if specified
	if s.URLPattern != "" {
		return matchGlob(u.Path, s.URLPattern)
	}

	return true
}

// extractBaseDomain extracts the base domain (e.g., "google.com" from "www.google.com")
func extractBaseDomain(host string) string {
	host = strings.ToLower(host)
	parts := strings.Split(host, ".")

	if len(parts) >= 2 {
		return strings.Join(parts[len(parts)-2:], ".")
	}
	return host
}

// matchGlob performs simple glob matching (* matches any characters)
func matchGlob(str, pattern string) bool {
	// Simple glob matching
	matched, _ := path.Match(pattern, str)
	if matched {
		return true
	}

	// Also try with ** support (match any path)
	if strings.Contains(pattern, "**") {
		// Replace ** with * for simpler matching
		simplePattern := strings.ReplaceAll(pattern, "**", "*")
		matched, _ = path.Match(simplePattern, str)
		return matched
	}

	return false
}

// GetDefaultSources returns the default set of analytics sources
func GetDefaultSources() []Source {
	return []Source{
		{
			ID:            "google-analytics",
			Name:          "Google Analytics",
			Icon:          "📊",
			Color:         "#F9AB00",
			Enabled:       true,
			Domain:        "google-analytics.com",
			URLPattern:    "/*/collect*",
			EventNamePath: "en",
		},
		{
			ID:            "google-analytics-mp",
			Name:          "Google Analytics (MP)",
			Icon:          "📊",
			Color:         "#F9AB00",
			Enabled:       true,
			Domain:        "google-analytics.com",
			URLPattern:    "/mp/collect*",
			EventNamePath: "events[0].name",
			BatchPath:     "events",
		},
		{
			ID:         "segment",
			Name:       "Segment",
			Icon:       "📈",
			Color:      "#52BD94",
			Enabled:    true,
			Domain:     "api.segment.io",
			URLPattern: "/v1/*",
			BatchPath:  "batch",
		},
		{
			ID:        "amplitude",
			Name:      "Amplitude",
			Icon:      "📉",
			Color:     "#1E61DC",
			Enabled:   true,
			Domain:    "api.amplitude.com",
			BatchPath: "events",
		},
		{
			ID:            "mixpanel",
			Name:          "Mixpanel",
			Icon:          "🔮",
			Color:         "#7856FF",
			Enabled:       true,
			Domain:        "api.mixpanel.com",
			EventNamePath: "event",
		},
		{
			ID:            "reddit-pixel",
			Name:          "Reddit Pixel",
			Icon:          "🔴",
			Color:         "#FF4500",
			Enabled:       true,
			Domain:        "alb.reddit.com",
			URLPattern:    "/rp.gif*",
			EventNamePath: "event",
		},
		{
			ID:            "heap",
			Name:          "Heap Analytics",
			Icon:          "🏔️",
			Color:         "#FF6B00",
			Enabled:       true,
			Domain:        "heapanalytics.com",
			EventNamePath: "a",
			BatchPath:     "b",
		},
		{
			ID:        "posthog",
			Name:      "PostHog",
			Icon:      "🦔",
			Color:     "#F9BD2B",
			Enabled:   true,
			Domain:    "app.posthog.com",
			BatchPath: "batch",
		},
		{
			ID:        "rudderstack",
			Name:      "RudderStack",
			Icon:      "🚀",
			Color:     "#3F77F4",
			Enabled:   true,
			Domain:    "rudderstack.com",
			BatchPath: "batch",
		},
		{
			ID:            "grammarly",
			Name:          "Grammarly",
			Icon:          "✍️",
			Color:         "#15C39A",
			Enabled:       true,
			Domain:        "grammarly.com",
			EventNamePath: "eventName",
			BatchPath:     "events",
		},
	}
}
