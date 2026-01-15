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
			Enabled:       true,
			Domain:        "google-analytics.com",
			URLPattern:    "/*/collect*",
			EventNamePath: "en",
		},
		{
			ID:            "google-analytics-mp",
			Name:          "Google Analytics (MP)",
			Enabled:       true,
			Domain:        "google-analytics.com",
			URLPattern:    "/mp/collect*",
			EventNamePath: "events[0].name",
			BatchPath:     "events",
		},
		{
			ID:         "segment",
			Name:       "Segment",
			Enabled:    true,
			Domain:     "api.segment.io",
			URLPattern: "/v1/*",
			BatchPath:  "batch",
		},
		{
			ID:         "amplitude",
			Name:       "Amplitude",
			Enabled:    true,
			Domain:     "api.amplitude.com",
			BatchPath:  "events",
		},
		{
			ID:            "mixpanel",
			Name:          "Mixpanel",
			Enabled:       true,
			Domain:        "api.mixpanel.com",
			EventNamePath: "event",
		},
		{
			ID:            "reddit-pixel",
			Name:          "Reddit Pixel",
			Enabled:       true,
			Domain:        "alb.reddit.com",
			URLPattern:    "/rp.gif*",
			EventNamePath: "event",
		},
		{
			ID:            "heap",
			Name:          "Heap Analytics",
			Enabled:       true,
			Domain:        "heapanalytics.com",
			EventNamePath: "a",
			BatchPath:     "b",
		},
		{
			ID:         "posthog",
			Name:       "PostHog",
			Enabled:    true,
			Domain:     "app.posthog.com",
			BatchPath:  "batch",
		},
		{
			ID:         "rudderstack",
			Name:       "RudderStack",
			Enabled:    true,
			Domain:     "rudderstack.com",
			BatchPath:  "batch",
		},
	}
}
